import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Loader2, ExternalLink } from 'lucide-react'
import { backlinksApi, type Backlink, type BacklinkFormData } from '@/api/backlinks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'

const emptyForm: BacklinkFormData = {
  anchorText: '',
  targetUrl: '',
  maxPerArticle: 1,
  priority: 0,
}

export function BacklinksPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBacklink, setEditingBacklink] = useState<Backlink | null>(null)
  const [form, setForm] = useState<BacklinkFormData>(emptyForm)

  const { data: backlinks, isLoading } = useQuery({
    queryKey: ['backlinks'],
    queryFn: backlinksApi.getBacklinks,
  })

  const createMutation = useMutation({
    mutationFn: backlinksApi.createBacklink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlinks'] })
      setDialogOpen(false)
      toast({ title: 'Backlink created', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to create backlink', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BacklinkFormData> }) =>
      backlinksApi.updateBacklink(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlinks'] })
      setDialogOpen(false)
      toast({ title: 'Backlink updated', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to update', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: backlinksApi.deleteBacklink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlinks'] })
      toast({ title: 'Backlink deleted', variant: 'success' })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: backlinksApi.toggleBacklink,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backlinks'] }),
  })

  function openCreate() {
    setEditingBacklink(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(backlink: Backlink) {
    setEditingBacklink(backlink)
    setForm({
      anchorText: backlink.anchorText,
      targetUrl: backlink.targetUrl,
      maxPerArticle: backlink.maxPerArticle,
      priority: backlink.priority,
    })
    setDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editingBacklink) {
      updateMutation.mutate({ id: editingBacklink.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  const activeCount = (backlinks ?? []).filter((b) => b.isActive).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Backlinks</h2>
          <p className="text-sm text-muted-foreground">
            {backlinks?.length ?? 0} backlinks ({activeCount} active)
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Backlink
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Anchor Text</TableHead>
                  <TableHead>Target URL</TableHead>
                  <TableHead>Max/Article</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(backlinks ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No backlinks yet. Add your first backlink rule.
                    </TableCell>
                  </TableRow>
                )}
                {(backlinks ?? []).map((backlink) => (
                  <TableRow key={backlink.id}>
                    <TableCell className="font-medium">
                      <Badge variant="secondary">{backlink.anchorText}</Badge>
                    </TableCell>
                    <TableCell>
                      <a
                        href={backlink.targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                      >
                        <span className="block max-w-[240px] truncate">{backlink.targetUrl}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{backlink.maxPerArticle}</TableCell>
                    <TableCell className="text-muted-foreground">{backlink.priority}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{backlink.totalUsageCount}x</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={backlink.isActive}
                        onCheckedChange={() => toggleMutation.mutate(backlink.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(backlink)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(backlink.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBacklink ? 'Edit Backlink' : 'Add Backlink'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="anchor">Anchor Text</Label>
              <Input
                id="anchor"
                value={form.anchorText}
                onChange={(e) => setForm({ ...form, anchorText: e.target.value })}
                placeholder="jasa seo profesional"
                required
              />
              <p className="text-xs text-muted-foreground">
                Keyword yang akan dijadikan link di dalam artikel
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target">Target URL</Label>
              <Input
                id="target"
                type="url"
                value={form.targetUrl}
                onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
                placeholder="https://moneysite.com/jasa-seo"
                required
              />
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="max">Max per Article</Label>
                <Input
                  id="max"
                  type="number"
                  min={1}
                  max={10}
                  value={form.maxPerArticle}
                  onChange={(e) =>
                    setForm({ ...form, maxPerArticle: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  min={0}
                  max={100}
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">Higher = inserted first</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSaving || !form.anchorText || !form.targetUrl}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingBacklink ? 'Save Changes' : 'Add Backlink'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
