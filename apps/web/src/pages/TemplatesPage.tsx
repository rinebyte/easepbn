import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Eye, Loader2, Star } from 'lucide-react'
import { templatesApi, type Template, type TemplateFormData } from '@/api/templates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'

const emptyForm: TemplateFormData = {
  name: '',
  description: '',
  systemPrompt: 'You are an expert SEO content writer. Write comprehensive, engaging articles.',
  userPromptTemplate: 'Write a detailed, SEO-optimized article about: {{keyword}}\n\nThe article should be at least 1000 words, include proper headings, and be written in an engaging style.',
  variables: ['keyword'],
  model: 'gpt-4o-mini',
  maxTokens: 2000,
  temperature: 0.7,
  isDefault: false,
}

export function TemplatesPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [form, setForm] = useState<TemplateFormData>(emptyForm)

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.getTemplates,
  })

  const createMutation = useMutation({
    mutationFn: templatesApi.createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setDialogOpen(false)
      toast({ title: 'Template created', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to create template', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TemplateFormData> }) =>
      templatesApi.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setDialogOpen(false)
      toast({ title: 'Template updated', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to update template', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: templatesApi.deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast({ title: 'Template deleted', variant: 'success' })
    },
  })

  function openCreate() {
    setEditingTemplate(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(template: Template) {
    setEditingTemplate(template)
    setForm({
      name: template.name,
      description: template.description ?? '',
      systemPrompt: template.systemPrompt,
      userPromptTemplate: template.userPromptTemplate,
      variables: template.variables,
      model: template.model,
      maxTokens: template.maxTokens,
      temperature: template.temperature,
      isDefault: template.isDefault,
    })
    setDialogOpen(true)
  }

  async function handlePreview(template: Template) {
    setPreviewing(true)
    try {
      const result = await templatesApi.previewTemplate(template.id, { keyword: 'example keyword' })
      setPreviewContent(result.prompt)
      setPreviewOpen(true)
    } catch {
      toast({ title: 'Preview failed', variant: 'destructive' })
    } finally {
      setPreviewing(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Templates</h2>
          <p className="text-sm text-muted-foreground">
            {templates?.length ?? 0} article generation templates
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Create Template
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(templates ?? []).length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-border p-12 text-center">
              <p className="text-sm text-muted-foreground">No templates yet. Create your first article template.</p>
            </div>
          )}
          {(templates ?? []).map((template) => (
            <Card key={template.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {template.isDefault && (
                        <Star className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                      )}
                      <span className="truncate">{template.name}</span>
                    </CardTitle>
                    {template.description && (
                      <CardDescription className="mt-1 line-clamp-2">
                        {template.description}
                      </CardDescription>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{template.model}</Badge>
                  <Badge variant="outline">{template.maxTokens} tokens</Badge>
                  <Badge variant="outline">temp {template.temperature}</Badge>
                  {template.isDefault && <Badge variant="success">Default</Badge>}
                </div>
                <p className="line-clamp-3 text-xs text-muted-foreground">
                  {template.systemPrompt}
                </p>
                <div className="flex gap-1 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => handlePreview(template)}
                    disabled={previewing}
                  >
                    {previewing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(template)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(template.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="t-name">Name</Label>
                <Input
                  id="t-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="SEO Blog Post"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-desc">Description</Label>
                <Input
                  id="t-desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="General SEO article template"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="t-system">System Prompt</Label>
              <Textarea
                id="t-system"
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                rows={4}
                placeholder="You are an expert SEO content writer..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="t-user">User Prompt Template</Label>
              <Textarea
                id="t-user"
                value={form.userPromptTemplate}
                onChange={(e) => setForm({ ...form, userPromptTemplate: e.target.value })}
                rows={5}
                placeholder="Write about: {{keyword}}"
              />
              <p className="text-xs text-muted-foreground">
                Use <code className="rounded bg-muted px-1 py-0.5">{'{{keyword}}'}</code> as the keyword placeholder.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Model</Label>
                <Select
                  value={form.model}
                  onValueChange={(v) => setForm({ ...form, model: v as Template['model'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-tokens">Max Tokens</Label>
                <Input
                  id="t-tokens"
                  type="number"
                  min={256}
                  max={16000}
                  step={256}
                  value={form.maxTokens}
                  onChange={(e) => setForm({ ...form, maxTokens: parseInt(e.target.value) || 2000 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-temp">Temperature</Label>
                <Input
                  id="t-temp"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={form.temperature}
                  onChange={(e) =>
                    setForm({ ...form, temperature: parseFloat(e.target.value) || 0.7 })
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="t-default"
                checked={form.isDefault}
                onCheckedChange={(checked) => setForm({ ...form, isDefault: checked })}
              />
              <Label htmlFor="t-default">Set as default template</Label>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSaving || !form.name}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingTemplate ? 'Save Changes' : 'Create Template'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto rounded-md bg-muted p-4">
            <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{previewContent}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
