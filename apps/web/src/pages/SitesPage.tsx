import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  TestTube2,
  Pencil,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  RotateCcw,
  Search,
  Upload,
  Tags,
} from 'lucide-react'
import { sitesApi, type Site, type SiteFormData, type SiteFilters } from '@/api/sites'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Pagination } from '@/components/ui/pagination'
import { toast } from '@/hooks/use-toast'
import { format } from 'date-fns'

function StatusBadge({ status }: { status: Site['status'] }) {
  if (status === 'active')
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" /> Active
      </Badge>
    )
  if (status === 'error')
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Error
      </Badge>
    )
  return (
    <Badge variant="secondary" className="gap-1">
      <HelpCircle className="h-3 w-3" /> Inactive
    </Badge>
  )
}

const emptyForm: SiteFormData = {
  name: '',
  url: '',
  username: '',
  applicationPassword: '',
  maxPostsPerDay: 10,
  tags: [],
  niche: '',
  notes: '',
}

export function SitesPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [bulkTagOpen, setBulkTagOpen] = useState(false)
  const [editingSite, setEditingSite] = useState<Site | null>(null)
  const [form, setForm] = useState<SiteFormData>(emptyForm)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [confirmDeleteSite, setConfirmDeleteSite] = useState<string | null>(null)

  // Phase 4: Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [nicheFilter, setNicheFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [importCsv, setImportCsv] = useState('')
  const [bulkTagValue, setBulkTagValue] = useState('')
  const [sitesPage, setSitesPage] = useState(1)
  const sitesPerPage = 20

  const filters: SiteFilters = {}
  if (searchQuery) filters.search = searchQuery
  if (statusFilter !== 'all') filters.status = statusFilter
  if (nicheFilter !== 'all') filters.niche = nicheFilter
  if (tagFilter !== 'all') filters.tag = tagFilter

  const { data, isLoading } = useQuery({
    queryKey: ['sites', sitesPage, filters],
    queryFn: () => sitesApi.getSites(sitesPage, sitesPerPage, filters),
  })

  const { data: tags } = useQuery({
    queryKey: ['site-tags'],
    queryFn: sitesApi.getTags,
  })

  const { data: niches } = useQuery({
    queryKey: ['site-niches'],
    queryFn: sitesApi.getNiches,
  })

  const createMutation = useMutation({
    mutationFn: sitesApi.createSite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      setDialogOpen(false)
      toast({ title: 'Site added', variant: 'success' })
    },
    onError: (err: Error) => toast({ title: 'Failed to add site', description: err.message, variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SiteFormData> }) =>
      sitesApi.updateSite(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      setDialogOpen(false)
      toast({ title: 'Site updated', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to update site', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: sitesApi.deleteSite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      toast({ title: 'Site deleted', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to delete site', variant: 'destructive' }),
  })

  const bulkTestMutation = useMutation({
    mutationFn: sitesApi.bulkTestSites,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      toast({ title: 'Bulk test complete', variant: 'success' })
    },
  })

  const resetPostsMutation = useMutation({
    mutationFn: (id?: string) => sitesApi.resetPostsToday(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      toast({ title: 'Posts today counter reset', variant: 'success' })
    },
  })

  const bulkImportMutation = useMutation({
    mutationFn: (sites: Parameters<typeof sitesApi.bulkImport>[0]) => sitesApi.bulkImport(sites),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      setImportOpen(false)
      setImportCsv('')
      toast({ title: res.message, variant: 'success' })
    },
    onError: () => toast({ title: 'Bulk import failed', variant: 'destructive' }),
  })

  const bulkUpdateMutation = useMutation({
    mutationFn: (updates: { tags?: string[]; niche?: string; maxPostsPerDay?: number }) =>
      sitesApi.bulkUpdate(selectedIds, updates),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      queryClient.invalidateQueries({ queryKey: ['site-tags'] })
      setBulkTagOpen(false)
      setSelectedIds([])
      toast({ title: res.message, variant: 'success' })
    },
  })

  function openCreate() {
    setEditingSite(null)
    setForm(emptyForm)
    setTagInput('')
    setTestResult(null)
    setDialogOpen(true)
  }

  function openEdit(site: Site) {
    setEditingSite(site)
    setForm({
      name: site.name,
      url: site.url,
      username: '',
      applicationPassword: '',
      maxPostsPerDay: site.maxPostsPerDay,
      tags: site.tags ?? [],
      niche: site.niche ?? '',
      notes: site.notes ?? '',
    })
    setTagInput((site.tags ?? []).join(', '))
    setTestResult(null)
    setDialogOpen(true)
  }

  async function handleTest() {
    if (editingSite) {
      setTesting(true)
      try {
        const result = await sitesApi.testSite(editingSite.id)
        setTestResult(result)
        queryClient.invalidateQueries({ queryKey: ['sites'] })
      } catch {
        setTestResult({ success: false, error: 'Test failed' })
      } finally {
        setTesting(false)
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedTags = tagInput.split(',').map((t) => t.trim()).filter(Boolean)
    if (editingSite) {
      const updateData: Partial<SiteFormData> = {
        name: form.name,
        url: form.url,
        maxPostsPerDay: form.maxPostsPerDay,
        tags: parsedTags,
        niche: form.niche,
        notes: form.notes,
      }
      if (form.username) updateData.username = form.username
      if (form.applicationPassword) updateData.applicationPassword = form.applicationPassword
      updateMutation.mutate({ id: editingSite.id, data: updateData })
    } else {
      createMutation.mutate({ ...form, tags: parsedTags })
    }
  }

  function handleCsvImport() {
    const lines = importCsv.trim().split('\n').filter(Boolean)
    const sites = lines.map((line) => {
      const [name, url, username, applicationPassword, maxPostsPerDay, niche, tags] = line.split(',').map((s) => s.trim())
      return {
        name: name || '',
        url: url || '',
        username: username || '',
        applicationPassword: applicationPassword || '',
        maxPostsPerDay: maxPostsPerDay ? parseInt(maxPostsPerDay) : 10,
        niche: niche || undefined,
        tags: tags ? tags.split(';').map((t) => t.trim()) : undefined,
      }
    })
    bulkImportMutation.mutate(sites)
  }

  const sites = data?.data ?? []
  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sites</h2>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} WordPress sites
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetPostsMutation.mutate(undefined)}
            disabled={resetPostsMutation.isPending}
          >
            {resetPostsMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <RotateCcw className="h-4 w-4" />
            Reset All
          </Button>
          {selectedIds.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkTestMutation.mutate(selectedIds)}
                disabled={bulkTestMutation.isPending}
              >
                {bulkTestMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <TestTube2 className="h-4 w-4" />
                Test {selectedIds.length}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkTagOpen(true)}
              >
                <Tags className="h-4 w-4" />
                Tag {selectedIds.length}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Site
          </Button>
        </div>
      </div>

      {/* Phase 4: Search & Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sites..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSitesPage(1) }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSitesPage(1) }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {(niches ?? []).length > 0 && (
          <Select value={nicheFilter} onValueChange={(v) => { setNicheFilter(v); setSitesPage(1) }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Niche" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Niches</SelectItem>
              {(niches ?? []).map((n) => (
                <SelectItem key={n} value={n!}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(tags ?? []).length > 0 && (
          <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v); setSitesPage(1) }}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {(tags ?? []).map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={selectedIds.length === sites.length && sites.length > 0}
                      onChange={(e) =>
                        setSelectedIds(e.target.checked ? sites.map((s) => s.id) : [])
                      }
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Posts Today</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Last Check</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No sites found.
                    </TableCell>
                  </TableRow>
                )}
                {sites.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="rounded border-input"
                        checked={selectedIds.includes(site.id)}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked ? [...prev, site.id] : prev.filter((id) => id !== site.id)
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">{site.name}</span>
                        {site.niche && (
                          <span className="ml-2 text-xs text-muted-foreground">{site.niche}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground hover:underline"
                      >
                        {site.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={site.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">
                          {site.postsToday} / {site.maxPostsPerDay}
                        </span>
                        {site.postsToday > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => resetPostsMutation.mutate(site.id)}
                            title="Reset counter"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(site.tags ?? []).slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {(site.tags ?? []).length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{site.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {site.lastHealthCheck
                        ? format(new Date(site.lastHealthCheck), 'MMM d, HH:mm')
                        : '\u2014'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(site)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setConfirmDeleteSite(site.id)}
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
        <Pagination
          page={sitesPage}
          totalPages={Math.ceil((data?.total ?? 0) / sitesPerPage)}
          total={data?.total ?? 0}
          limit={sitesPerPage}
          onPageChange={setSitesPage}
        />
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSite ? 'Edit Site' : 'Add Site'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My WordPress Blog"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">
                WP Username{editingSite && ' (leave blank to keep existing)'}
              </Label>
              <Input
                id="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="admin"
                required={!editingSite}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appPassword">
                Application Password{editingSite && ' (leave blank to keep existing)'}
              </Label>
              <Input
                id="appPassword"
                type="password"
                value={form.applicationPassword}
                onChange={(e) => setForm({ ...form, applicationPassword: e.target.value })}
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                required={!editingSite}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPosts">Max Posts Per Day</Label>
              <Input
                id="maxPosts"
                type="number"
                min={1}
                max={100}
                value={form.maxPostsPerDay}
                onChange={(e) =>
                  setForm({ ...form, maxPostsPerDay: parseInt(e.target.value) || 1 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="pbn, tier1, health"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="niche">Niche</Label>
              <Input
                id="niche"
                value={form.niche}
                onChange={(e) => setForm({ ...form, niche: e.target.value })}
                placeholder="Health & Fitness"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes..."
                rows={2}
              />
            </div>

            {testResult && (
              <p
                className={`rounded-md border px-3 py-2 text-xs ${
                  testResult.success
                    ? 'border-green-500/20 bg-green-500/5 text-green-400'
                    : 'border-red-500/20 bg-red-500/5 text-red-500'
                }`}
              >
                {testResult.success ? 'Connection successful!' : testResult.error ?? 'Connection failed'}
              </p>
            )}

            <DialogFooter className="gap-2">
              {editingSite && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTest}
                  disabled={testing}
                >
                  {testing && <Loader2 className="h-4 w-4 animate-spin" />}
                  <TestTube2 className="h-4 w-4" />
                  Test
                </Button>
              )}
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingSite ? 'Save Changes' : 'Add Site'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Import Sites</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>CSV Data (one site per line)</Label>
              <Textarea
                value={importCsv}
                onChange={(e) => setImportCsv(e.target.value)}
                placeholder="name,url,username,app_password,max_posts,niche,tags"
                rows={8}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Format: name, url, username, app_password, max_posts_per_day, niche, tags (semicolon-separated)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCsvImport}
              disabled={!importCsv.trim() || bulkImportMutation.isPending}
            >
              {bulkImportMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Import {importCsv.trim().split('\n').filter(Boolean).length} Sites
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Tag Dialog */}
      <Dialog open={bulkTagOpen} onOpenChange={setBulkTagOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tag {selectedIds.length} Sites</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tags (comma separated)</Label>
              <Input
                value={bulkTagValue}
                onChange={(e) => setBulkTagValue(e.target.value)}
                placeholder="pbn, tier1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                const newTags = bulkTagValue.split(',').map((t) => t.trim()).filter(Boolean)
                bulkUpdateMutation.mutate({ tags: newTags })
              }}
              disabled={bulkUpdateMutation.isPending}
            >
              {bulkUpdateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Apply Tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteSite !== null}
        onOpenChange={(open) => !open && setConfirmDeleteSite(null)}
        title="Delete Site"
        description="Are you sure? All posts linked to this site will also be deleted. This cannot be undone."
        confirmLabel="Delete Site"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (confirmDeleteSite) deleteMutation.mutate(confirmDeleteSite)
          setConfirmDeleteSite(null)
        }}
      />
    </div>
  )
}
