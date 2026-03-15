import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, Eye, Layers } from 'lucide-react'
import { articlesApi, type Article } from '@/api/articles'
import { templatesApi } from '@/api/templates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

function statusVariant(status: Article['status']) {
  const map: Record<Article['status'], 'secondary' | 'info' | 'success' | 'destructive'> = {
    draft: 'secondary',
    generating: 'info',
    generated: 'success',
    failed: 'destructive',
  }
  return map[status]
}

type FilterTab = 'all' | Article['status']

export function ArticlesPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<FilterTab>('all')
  const [generateOpen, setGenerateOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [viewArticle, setViewArticle] = useState<Article | null>(null)
  const [confirmDeleteArticle, setConfirmDeleteArticle] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [articlesPage, setArticlesPage] = useState(1)
  const articlesPerPage = 20

  // Generate form state
  const [genForm, setGenForm] = useState({ templateId: '', keyword: '' })
  const [bulkForm, setBulkForm] = useState({ templateId: '', keywords: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['articles', articlesPage, tab],
    queryFn: () =>
      articlesApi.getArticles(articlesPage, articlesPerPage, tab === 'all' ? undefined : tab),
  })

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.getTemplates,
  })

  const generateMutation = useMutation({
    mutationFn: articlesApi.generateArticle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      setGenerateOpen(false)
      setGenForm({ templateId: '', keyword: '' })
      toast({ title: 'Article generation queued', variant: 'success' })
    },
    onError: () => toast({ title: 'Generation failed', variant: 'destructive' }),
  })

  const bulkMutation = useMutation({
    mutationFn: articlesApi.bulkGenerateArticles,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      setBulkOpen(false)
      setBulkForm({ templateId: '', keywords: '' })
      toast({ title: `${data.jobCount ?? 0} articles queued`, variant: 'success' })
    },
    onError: () => toast({ title: 'Bulk generation failed', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      articlesApi.updateArticle(id, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      setViewArticle(null)
      toast({ title: 'Article updated', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to update article', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: articlesApi.deleteArticle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      toast({ title: 'Article deleted', variant: 'success' })
    },
  })

  const articles = data?.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Articles</h2>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} articles</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
            <Layers className="h-4 w-4" />
            Bulk Generate
          </Button>
          <Button size="sm" onClick={() => setGenerateOpen(true)}>
            <Plus className="h-4 w-4" />
            Generate Article
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as FilterTab); setArticlesPage(1) }}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="generated">Generated</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
        </TabsList>
      </Tabs>

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
                  <TableHead>Title</TableHead>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No articles found.
                    </TableCell>
                  </TableRow>
                )}
                {articles.map((article) => (
                  <TableRow key={article.id}>
                    <TableCell className="font-medium">
                      <span className="block max-w-[240px] truncate">
                        {article.title || article.focusKeyword}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{article.focusKeyword}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(article.status)}>{article.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {article.generationTokens ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {article.generationCost ? `$${parseFloat(article.generationCost).toFixed(4)}` : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(article.createdAt), 'MMM d')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setViewArticle(article)
                            setEditContent(article.content ?? '')
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setConfirmDeleteArticle(article.id)}
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
          page={articlesPage}
          totalPages={Math.ceil((data?.total ?? 0) / articlesPerPage)}
          total={data?.total ?? 0}
          limit={articlesPerPage}
          onPageChange={setArticlesPage}
        />
      </Card>

      {/* Generate Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Article</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select
                value={genForm.templateId}
                onValueChange={(v) => setGenForm({ ...genForm, templateId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
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
              <Label htmlFor="keyword">Keyword</Label>
              <Input
                id="keyword"
                value={genForm.keyword}
                onChange={(e) => setGenForm({ ...genForm, keyword: e.target.value })}
                placeholder="best coffee makers 2025"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => generateMutation.mutate(genForm)}
              disabled={!genForm.templateId || !genForm.keyword || generateMutation.isPending}
            >
              {generateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Generate Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Generate Articles</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select
                value={bulkForm.templateId}
                onValueChange={(v) => setBulkForm({ ...bulkForm, templateId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
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
              <Label htmlFor="keywords">Keywords (one per line)</Label>
              <Textarea
                id="keywords"
                value={bulkForm.keywords}
                onChange={(e) => setBulkForm({ ...bulkForm, keywords: e.target.value })}
                placeholder={"best coffee makers\nbest espresso machines\nbest grinders"}
                rows={8}
              />
              <p className="text-xs text-muted-foreground">
                {bulkForm.keywords.split('\n').filter((k) => k.trim()).length} keywords entered
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                bulkMutation.mutate({
                  templateId: bulkForm.templateId,
                  keywords: bulkForm.keywords.split('\n').filter((k) => k.trim()),
                })
              }
              disabled={!bulkForm.templateId || !bulkForm.keywords.trim() || bulkMutation.isPending}
            >
              {bulkMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View/Edit Article Dialog */}
      <Dialog open={!!viewArticle} onOpenChange={(open) => !open && setViewArticle(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">
              {viewArticle?.title || viewArticle?.focusKeyword}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Badge variant={statusVariant(viewArticle?.status ?? 'draft')}>
                {viewArticle?.status}
              </Badge>
              <span>Keyword: {viewArticle?.focusKeyword}</span>
              {viewArticle?.generationTokens && <span>{viewArticle.generationTokens} tokens</span>}
              {viewArticle?.generationCost && <span>${parseFloat(viewArticle.generationCost).toFixed(4)}</span>}
            </div>
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[400px] font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewArticle(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                viewArticle && updateMutation.mutate({ id: viewArticle.id, content: editContent })
              }
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteArticle !== null}
        onOpenChange={(open) => !open && setConfirmDeleteArticle(null)}
        title="Delete Article"
        description="Are you sure? Related posts will also be deleted. This cannot be undone."
        confirmLabel="Delete Article"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (confirmDeleteArticle) deleteMutation.mutate(confirmDeleteArticle)
          setConfirmDeleteArticle(null)
        }}
      />
    </div>
  )
}
