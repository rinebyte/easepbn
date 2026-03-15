import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, RotateCcw, ExternalLink, Loader2, XCircle, Zap } from 'lucide-react'
import { postsApi, type Post } from '@/api/posts'
import { articlesApi, type Article } from '@/api/articles'
import { sitesApi, type Site } from '@/api/sites'
import { templatesApi } from '@/api/templates'
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
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'
import { format } from 'date-fns'

function statusVariant(status: Post['status']) {
  const map: Record<Post['status'], 'warning' | 'info' | 'success' | 'destructive'> = {
    pending: 'warning',
    posting: 'info',
    posted: 'success',
    failed: 'destructive',
  }
  return map[status]
}

export function PostsPage() {
  const queryClient = useQueryClient()
  const [postOpen, setPostOpen] = useState(false)
  const [blastOpen, setBlastOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<Post['status'] | 'all'>('all')
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [selectedArticleId, setSelectedArticleId] = useState('')
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])
  const [blastKeyword, setBlastKeyword] = useState('')
  const [blastTemplateId, setBlastTemplateId] = useState('')
  const [blastSiteIds, setBlastSiteIds] = useState<string[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['posts', statusFilter, siteFilter],
    queryFn: () =>
      postsApi.getPosts(1, 50, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        siteId: siteFilter === 'all' ? undefined : siteFilter,
      }),
  })

  const { data: articlesData } = useQuery({
    queryKey: ['articles-generated'],
    queryFn: () => articlesApi.getArticles(1, 200, 'generated'),
  })

  const { data: sitesData } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.getSites(1, 200),
  })

  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.getTemplates(),
  })

  const blastMutation = useMutation({
    mutationFn: postsApi.blastPost,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.invalidateQueries({ queryKey: ['articles-generated'] })
      setBlastOpen(false)
      setBlastKeyword('')
      setBlastTemplateId('')
      setBlastSiteIds([])
      toast({
        title: 'Blast started',
        description: res.message,
        variant: 'success',
      })
    },
    onError: () => toast({ title: 'Blast failed', variant: 'destructive' }),
  })

  const bulkPostMutation = useMutation({
    mutationFn: postsApi.bulkCreatePosts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      setPostOpen(false)
      setSelectedArticleId('')
      setSelectedSiteIds([])
      toast({ title: 'Posts queued successfully', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to create posts', variant: 'destructive' }),
  })

  const retryMutation = useMutation({
    mutationFn: postsApi.retryPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      toast({ title: 'Post retry queued', variant: 'success' })
    },
  })

  // Phase 4: Bulk retry
  const bulkRetryMutation = useMutation({
    mutationFn: () => postsApi.bulkRetry({
      siteId: siteFilter !== 'all' ? siteFilter : undefined,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      toast({ title: res.message, variant: 'success' })
    },
    onError: () => toast({ title: 'Bulk retry failed', variant: 'destructive' }),
  })

  // Phase 4: Bulk delete
  const bulkDeleteMutation = useMutation({
    mutationFn: () =>
      postsApi.bulkDelete({
        status: statusFilter !== 'all' ? statusFilter : 'failed',
        siteId: siteFilter !== 'all' ? siteFilter : undefined,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      toast({ title: res.message, variant: 'success' })
    },
    onError: () => toast({ title: 'Bulk delete failed', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: postsApi.deletePost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      toast({ title: 'Post deleted', variant: 'success' })
    },
  })

  const unpublishMutation = useMutation({
    mutationFn: postsApi.unpublishPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      toast({ title: 'Post unpublished from WordPress', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to unpublish', variant: 'destructive' }),
  })

  function toggleSite(siteId: string) {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]
    )
  }

  function toggleBlastSite(siteId: string) {
    setBlastSiteIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]
    )
  }

  const posts = data?.data ?? []
  const allArticles = articlesData?.data ?? []
  const allSites = sitesData?.data ?? []
  const allTemplates = templatesData ?? []
  const activeSites = allSites.filter((s) => s.status === 'active')

  const failedCount = posts.filter((p) => p.status === 'failed').length

  // Build lookup maps for display
  const articleMap = new Map<string, Article>()
  for (const a of allArticles) articleMap.set(a.id, a)

  const siteMap = new Map<string, Site>()
  for (const s of allSites) siteMap.set(s.id, s)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Posts</h2>
          <p className="text-sm text-muted-foreground">{posts.length} posts</p>
        </div>
        <div className="flex gap-2">
          {/* Phase 4: Bulk actions */}
          {(statusFilter === 'failed' || failedCount > 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkRetryMutation.mutate()}
              disabled={bulkRetryMutation.isPending}
            >
              {bulkRetryMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <RotateCcw className="h-4 w-4" />
              Retry All Failed
            </Button>
          )}
          {statusFilter === 'failed' && posts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkDeleteMutation.mutate()}
              disabled={bulkDeleteMutation.isPending}
              className="text-destructive"
            >
              {bulkDeleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Trash2 className="h-4 w-4" />
              Delete All Failed
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setBlastOpen(true)} className="border-orange-500 text-orange-600 hover:bg-orange-50">
            <Zap className="h-4 w-4" />
            Blast Post
          </Button>
          <Button size="sm" onClick={() => setPostOpen(true)}>
            <Plus className="h-4 w-4" />
            New Post
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Post['status'] | 'all')}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="posting">Posting</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {allSites.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  <TableHead>Article</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>WP Post</TableHead>
                  <TableHead>Posted At</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No posts found.
                    </TableCell>
                  </TableRow>
                )}
                {posts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell className="font-medium">
                      <span className="block max-w-[200px] truncate">
                        {articleMap.get(post.articleId)?.title ?? post.articleId.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {siteMap.get(post.siteId)?.name ?? post.siteId.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(post.status)}>{post.status}</Badge>
                      {post.errorMessage && post.status === 'failed' && (
                        <p className="mt-1 max-w-[200px] truncate text-xs text-destructive" title={post.errorMessage}>
                          {post.errorMessage}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {post.wpPostUrl ? (
                        <a
                          href={post.wpPostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                        >
                          #{post.wpPostId} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{'\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {post.postedAt ? format(new Date(post.postedAt), 'MMM d, HH:mm') : '\u2014'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {post.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => retryMutation.mutate(post.id)}
                            disabled={retryMutation.isPending}
                            title="Retry"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {post.status === 'posted' && post.wpPostId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-orange-500 hover:text-orange-500"
                            onClick={() => unpublishMutation.mutate(post.id)}
                            disabled={unpublishMutation.isPending}
                            title="Unpublish from WordPress"
                          >
                            {unpublishMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(post.id)}
                          title="Delete record"
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

      {/* New Post Dialog */}
      <Dialog open={postOpen} onOpenChange={setPostOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Article</Label>
              <Select value={selectedArticleId} onValueChange={setSelectedArticleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an article" />
                </SelectTrigger>
                <SelectContent>
                  {allArticles.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title || a.focusKeyword}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Sites</Label>
              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-input p-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={selectedSiteIds.length === allSites.length && allSites.length > 0}
                    onChange={(e) =>
                      setSelectedSiteIds(e.target.checked ? allSites.map((s) => s.id) : [])
                    }
                  />
                  Select All ({allSites.length})
                </label>
                <div className="my-1 border-t border-border" />
                {allSites.map((site) => (
                  <label key={site.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={selectedSiteIds.includes(site.id)}
                      onChange={() => toggleSite(site.id)}
                    />
                    {site.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                bulkPostMutation.mutate({
                  articleId: selectedArticleId,
                  siteIds: selectedSiteIds,
                })
              }
              disabled={!selectedArticleId || selectedSiteIds.length === 0 || bulkPostMutation.isPending}
            >
              {bulkPostMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Post to {selectedSiteIds.length} Site{selectedSiteIds.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blast Post Dialog */}
      <Dialog open={blastOpen} onOpenChange={setBlastOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-orange-500" />
              Blast Post
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Generate a unique article for each selected PBN site and post them all. Every site gets a different article with varied writing style.
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Keyword</Label>
              <Input
                placeholder="e.g. cara meningkatkan traffic website"
                value={blastKeyword}
                onChange={(e) => setBlastKeyword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={blastTemplateId} onValueChange={setBlastTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {allTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Sites ({blastSiteIds.length} selected)</Label>
              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border border-input p-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={blastSiteIds.length === activeSites.length && activeSites.length > 0}
                    onChange={(e) =>
                      setBlastSiteIds(e.target.checked ? activeSites.map((s) => s.id) : [])
                    }
                  />
                  Select All Active ({activeSites.length})
                </label>
                <div className="my-1 border-t border-border" />
                {allSites.map((site) => (
                  <label key={site.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={blastSiteIds.includes(site.id)}
                      onChange={() => toggleBlastSite(site.id)}
                      disabled={site.status !== 'active'}
                    />
                    <span className={site.status !== 'active' ? 'text-muted-foreground line-through' : ''}>
                      {site.name}
                    </span>
                    {site.status !== 'active' && (
                      <Badge variant="destructive" className="text-[10px] px-1 py-0">{site.status}</Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <div className="flex w-full items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {blastSiteIds.length} unique articles will be generated
              </p>
              <Button
                onClick={() =>
                  blastMutation.mutate({
                    keyword: blastKeyword,
                    templateId: blastTemplateId,
                    siteIds: blastSiteIds,
                  })
                }
                disabled={
                  !blastKeyword.trim() ||
                  !blastTemplateId ||
                  blastSiteIds.length === 0 ||
                  blastMutation.isPending
                }
                className="bg-orange-600 hover:bg-orange-700"
              >
                {blastMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Zap className="h-4 w-4" />
                Blast to {blastSiteIds.length} Site{blastSiteIds.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
