import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Play, History, Loader2, Upload, RotateCcw, Database } from 'lucide-react'
import { schedulesApi, type Schedule, type ScheduleFormData } from '@/api/schedules'
import { templatesApi, type Template } from '@/api/templates'
import { sitesApi } from '@/api/sites'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import { format } from 'date-fns'

const FREQUENCY_OPTIONS: { value: Schedule['frequency']; label: string; cron: string }[] = [
  { value: 'hourly', label: 'Hourly', cron: '0 * * * *' },
  { value: 'daily', label: 'Daily', cron: '0 9 * * *' },
  { value: 'weekly', label: 'Weekly', cron: '0 9 * * 1' },
  { value: 'custom', label: 'Custom', cron: '' },
]

const emptyForm: ScheduleFormData = {
  name: '',
  frequency: 'daily',
  cronExpression: '0 9 * * *',
  templateId: '',
  keywords: [],
  targetSiteIds: [],
  categoryNames: [],
  tagNames: [],
  postsPerExecution: 1,
  contentBrief: '',
  spreadWindowMinutes: 240,
  uniqueArticlePerSite: false,
}

export function SchedulesPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [historySchedule, setHistorySchedule] = useState<Schedule | null>(null)
  const [keywordPoolSchedule, setKeywordPoolSchedule] = useState<Schedule | null>(null)
  const [form, setForm] = useState<ScheduleFormData>(emptyForm)
  const [confirmDeleteSchedule, setConfirmDeleteSchedule] = useState<string | null>(null)
  const [keywordsText, setKeywordsText] = useState('')
  const [keywordImportText, setKeywordImportText] = useState('')
  const [siteSearch, setSiteSearch] = useState('')

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: schedulesApi.getSchedules,
  })

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.getTemplates,
  })

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.getSites(1, 200),
  })

  const { data: history } = useQuery({
    queryKey: ['schedule-history', historySchedule?.id],
    queryFn: () => schedulesApi.getScheduleHistory(historySchedule!.id),
    enabled: !!historySchedule,
  })

  // Phase 2: Keyword pool data
  const { data: keywordPoolData, refetch: refetchKeywords } = useQuery({
    queryKey: ['keyword-pool', keywordPoolSchedule?.id],
    queryFn: () => schedulesApi.getKeywords(keywordPoolSchedule!.id),
    enabled: !!keywordPoolSchedule,
  })

  const createMutation = useMutation({
    mutationFn: schedulesApi.createSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      setDialogOpen(false)
      toast({ title: 'Schedule created', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to create schedule', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ScheduleFormData> }) =>
      schedulesApi.updateSchedule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      setDialogOpen(false)
      toast({ title: 'Schedule updated', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to update', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: schedulesApi.deleteSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      toast({ title: 'Schedule deleted', variant: 'success' })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: schedulesApi.toggleSchedule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  })

  const runNowMutation = useMutation({
    mutationFn: schedulesApi.runNow,
    onSuccess: () => toast({ title: 'Schedule triggered', variant: 'success' }),
    onError: () => toast({ title: 'Failed to trigger', variant: 'destructive' }),
  })

  const importKeywordsMutation = useMutation({
    mutationFn: ({ scheduleId, keywords }: { scheduleId: string; keywords: string[] }) =>
      schedulesApi.importKeywords(scheduleId, keywords),
    onSuccess: (res) => {
      refetchKeywords()
      setKeywordImportText('')
      toast({ title: `Imported ${res.imported} keywords (${res.duplicates} duplicates skipped)`, variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to import keywords', variant: 'destructive' }),
  })

  const deleteKeywordMutation = useMutation({
    mutationFn: ({ scheduleId, keywordId }: { scheduleId: string; keywordId: string }) =>
      schedulesApi.deleteKeyword(scheduleId, keywordId),
    onSuccess: () => {
      refetchKeywords()
      toast({ title: 'Keyword deleted', variant: 'success' })
    },
  })

  const resetKeywordsMutation = useMutation({
    mutationFn: (scheduleId: string) => schedulesApi.resetKeywords(scheduleId),
    onSuccess: (res) => {
      refetchKeywords()
      toast({ title: `Reset ${res.count} exhausted keywords`, variant: 'success' })
    },
  })

  function openCreate() {
    setEditingSchedule(null)
    setForm(emptyForm)
    setKeywordsText('')
    setSiteSearch('')
    setDialogOpen(true)
  }

  function openEdit(schedule: Schedule) {
    setEditingSchedule(schedule)
    setForm({
      name: schedule.name,
      frequency: schedule.frequency,
      cronExpression: schedule.cronExpression,
      templateId: schedule.templateId ?? '',
      keywords: schedule.keywords,
      targetSiteIds: schedule.targetSiteIds,
      categoryNames: schedule.categoryNames,
      tagNames: schedule.tagNames,
      postsPerExecution: schedule.postsPerExecution,
      contentBrief: schedule.contentBrief ?? '',
      spreadWindowMinutes: schedule.spreadWindowMinutes ?? 240,
      uniqueArticlePerSite: schedule.uniqueArticlePerSite ?? false,
    })
    setKeywordsText(schedule.keywords.join('\n'))
    setSiteSearch('')
    setDialogOpen(true)
  }

  function handleFrequencyChange(freq: Schedule['frequency']) {
    const option = FREQUENCY_OPTIONS.find((o) => o.value === freq)
    setForm({ ...form, frequency: freq, cronExpression: option?.cron ?? '' })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const keywords = keywordsText.split('\n').filter((k) => k.trim())
    const payload = { ...form, keywords }
    if (editingSchedule) {
      updateMutation.mutate({ id: editingSchedule.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  function toggleSiteInForm(siteId: string) {
    setForm((prev) => ({
      ...prev,
      targetSiteIds: prev.targetSiteIds.includes(siteId)
        ? prev.targetSiteIds.filter((id) => id !== siteId)
        : [...prev.targetSiteIds, siteId],
    }))
  }

  function formatSpreadWindow(minutes: number): string {
    if (minutes < 60) return `${minutes}min`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }

  const allSites = sites?.data ?? []
  const filteredSites = siteSearch.trim()
    ? allSites.filter((s) => s.name.toLowerCase().includes(siteSearch.toLowerCase()))
    : allSites
  const templateMap = new Map<string, Template>()
  for (const t of templates ?? []) templateMap.set(t.id, t)
  const isSaving = createMutation.isPending || updateMutation.isPending

  const keywordStats = keywordPoolData?.stats
  const poolKeywords = keywordPoolData?.keywords ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Schedules</h2>
          <p className="text-sm text-muted-foreground">
            {schedules?.length ?? 0} scheduled auto-posting rules
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Create Schedule
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Sites</TableHead>
                  <TableHead>Keywords</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead className="w-40">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(schedules ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      No schedules yet.
                    </TableCell>
                  </TableRow>
                )}
                {(schedules ?? []).map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{schedule.name}</span>
                        {schedule.uniqueArticlePerSite && (
                          <Badge variant="secondary" className="ml-2 text-xs">unique/site</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {schedule.frequency}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {schedule.templateId ? templateMap.get(schedule.templateId)?.name ?? '\u2014' : '\u2014'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{schedule.targetSiteIds.length}</TableCell>
                    <TableCell className="text-muted-foreground">{schedule.keywords.length}</TableCell>
                    <TableCell>
                      <Switch
                        checked={schedule.enabled}
                        onCheckedChange={() => toggleMutation.mutate(schedule.id)}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {schedule.lastRunAt
                        ? format(new Date(schedule.lastRunAt), 'MMM d, HH:mm')
                        : '\u2014'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {schedule.nextRunAt
                        ? format(new Date(schedule.nextRunAt), 'MMM d, HH:mm')
                        : '\u2014'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => runNowMutation.mutate(schedule.id)}
                          title="Run now"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setKeywordPoolSchedule(schedule)}
                          title="Keyword pool"
                        >
                          <Database className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setHistorySchedule(schedule)}
                          title="History"
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(schedule)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setConfirmDeleteSchedule(schedule.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? 'Edit Schedule' : 'Create Schedule'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sched-name">Name</Label>
              <Input
                id="sched-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Daily Tech Posts"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={handleFrequencyChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.frequency === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="cron">Cron Expression</Label>
                <Input
                  id="cron"
                  value={form.cronExpression}
                  onChange={(e) => setForm({ ...form, cronExpression: e.target.value })}
                  placeholder="0 */6 * * *"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Standard cron syntax (minute hour day month weekday)</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Template</Label>
              <Select
                value={form.templateId}
                onValueChange={(v) => setForm({ ...form, templateId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Keywords (one per line, fallback if keyword pool empty)</Label>
              <Textarea
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder={"keyword one\nkeyword two"}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                {keywordsText.split('\n').filter((k) => k.trim()).length} keywords (use Keyword Pool for LRU rotation)
              </p>
            </div>
            <div className="space-y-2">
              <Label>Content Brief (optional)</Label>
              <Textarea
                value={form.contentBrief ?? ''}
                onChange={(e) => setForm({ ...form, contentBrief: e.target.value })}
                placeholder={"Describe the brand, product, or niche so AI has context when generating articles from these keywords.\n\nExample: BrandX is a SaaS platform for local SEO based in Jakarta..."}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This context is appended to every article prompt, helping AI understand what your keywords are about
              </p>
            </div>
            <div className="space-y-2">
              <Label>Target Sites</Label>
              <Input
                placeholder="Search sites..."
                value={siteSearch}
                onChange={(e) => setSiteSearch(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-md border border-input p-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={form.targetSiteIds.length === allSites.length && allSites.length > 0}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        targetSiteIds: e.target.checked ? allSites.map((s) => s.id) : [],
                      })
                    }
                  />
                  Select All ({allSites.length})
                </label>
                <div className="my-1 border-t border-border" />
                {filteredSites.map((site) => (
                  <label key={site.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={form.targetSiteIds.includes(site.id)}
                      onChange={() => toggleSiteInForm(site.id)}
                    />
                    {site.name}
                    {site.status !== 'active' && (
                      <Badge variant="secondary" className="text-xs">{site.status}</Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pex">Posts Per Execution</Label>
              <Input
                id="pex"
                type="number"
                min={1}
                max={50}
                value={form.postsPerExecution}
                onChange={(e) =>
                  setForm({ ...form, postsPerExecution: parseInt(e.target.value) || 1 })
                }
              />
            </div>

            {/* Phase 5: Content diversity controls */}
            <div className="space-y-3 rounded-md border border-input p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Unique article per site</Label>
                <Switch
                  checked={form.uniqueArticlePerSite ?? false}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, uniqueArticlePerSite: checked })
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Generate a different article for each target site instead of sharing one article.
              </p>

              <div className="space-y-2">
                <Label className="text-sm">
                  Spread window: {formatSpreadWindow(form.spreadWindowMinutes ?? 240)}
                </Label>
                <Slider
                  value={[form.spreadWindowMinutes ?? 240]}
                  onValueChange={([v]) => setForm({ ...form, spreadWindowMinutes: v })}
                  min={30}
                  max={1440}
                  step={30}
                />
                <p className="text-xs text-muted-foreground">
                  Randomize posting times within this window to avoid detection patterns.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={isSaving || !form.templateId || !form.name}
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingSchedule ? 'Save Changes' : 'Create Schedule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={!!historySchedule} onOpenChange={(open) => !open && setHistorySchedule(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Run History - {historySchedule?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {(history ?? []).length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">No history yet</p>
            )}
            {(history ?? []).map((entry: any) => (
              <div key={entry.id} className="flex items-center justify-between border-b border-border py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {format(new Date(entry.createdAt), 'MMM d, yyyy HH:mm')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.message}
                  </p>
                </div>
                <Badge variant={entry.level === 'error' ? 'destructive' : 'success'}>
                  {entry.level}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Phase 2: Keyword Pool Dialog */}
      <Dialog open={!!keywordPoolSchedule} onOpenChange={(open) => !open && setKeywordPoolSchedule(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Keyword Pool - {keywordPoolSchedule?.name}</DialogTitle>
          </DialogHeader>

          {/* Stats */}
          {keywordStats && (
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Badge variant="success">{keywordStats.available}</Badge> available
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="warning">{keywordStats.used}</Badge> used
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="destructive">{keywordStats.exhausted}</Badge> exhausted
              </div>
              <div className="text-muted-foreground">
                {keywordStats.total} total
              </div>
            </div>
          )}

          {/* Import section */}
          <div className="space-y-2">
            <Label>Import Keywords (one per line or CSV)</Label>
            <Textarea
              value={keywordImportText}
              onChange={(e) => setKeywordImportText(e.target.value)}
              placeholder={"best seo tools 2024\nhow to rank on google\nbacklink building strategies"}
              rows={4}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const keywords = keywordImportText
                    .split(/[\n,]/)
                    .map((k) => k.trim())
                    .filter(Boolean)
                  importKeywordsMutation.mutate({
                    scheduleId: keywordPoolSchedule!.id,
                    keywords,
                  })
                }}
                disabled={!keywordImportText.trim() || importKeywordsMutation.isPending}
              >
                {importKeywordsMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Upload className="h-4 w-4" />
                Import
              </Button>
              {(keywordStats?.exhausted ?? 0) > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resetKeywordsMutation.mutate(keywordPoolSchedule!.id)}
                  disabled={resetKeywordsMutation.isPending}
                >
                  {resetKeywordsMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <RotateCcw className="h-4 w-4" />
                  Reset Exhausted
                </Button>
              )}
            </div>
          </div>

          {/* Keyword list */}
          <div className="max-h-72 overflow-y-auto overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poolKeywords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No keywords in pool. Import some above.
                    </TableCell>
                  </TableRow>
                )}
                {poolKeywords.map((kw) => (
                  <TableRow key={kw.id}>
                    <TableCell className="font-medium">{kw.keyword}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          kw.status === 'available'
                            ? 'success'
                            : kw.status === 'used'
                            ? 'warning'
                            : 'destructive'
                        }
                        className="text-xs"
                      >
                        {kw.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{kw.usageCount}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {kw.lastUsedAt
                        ? format(new Date(kw.lastUsedAt), 'MMM d, HH:mm')
                        : '\u2014'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() =>
                          deleteKeywordMutation.mutate({
                            scheduleId: keywordPoolSchedule!.id,
                            keywordId: kw.id,
                          })
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteSchedule !== null}
        onOpenChange={(open) => !open && setConfirmDeleteSchedule(null)}
        title="Delete Schedule"
        description="Are you sure? Keywords linked to this schedule will also be deleted. This cannot be undone."
        confirmLabel="Delete Schedule"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (confirmDeleteSchedule) deleteMutation.mutate(confirmDeleteSchedule)
          setConfirmDeleteSchedule(null)
        }}
      />
    </div>
  )
}
