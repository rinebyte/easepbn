import { useQuery } from '@tanstack/react-query'
import {
  Globe,
  FileText,
  Clock,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  Loader2,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import { analyticsApi } from '@/api/analytics'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function StatCard({
  label,
  value,
  icon: Icon,
  description,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  description?: string
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ProgressBar({ completed, target }: { completed: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{completed} / {target} posts</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function QueueWidget({ label, counts }: { label: string; counts: { waiting: number; active: number; delayed: number; failed: number } | null }) {
  if (!counts) return null
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex gap-2 text-xs">
        {counts.active > 0 && (
          <Badge variant="info" className="gap-1 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" /> {counts.active}
          </Badge>
        )}
        {counts.waiting > 0 && (
          <Badge variant="warning" className="text-xs">{counts.waiting} waiting</Badge>
        )}
        {counts.delayed > 0 && (
          <Badge variant="secondary" className="text-xs">{counts.delayed} delayed</Badge>
        )}
        {counts.failed > 0 && (
          <Badge variant="destructive" className="text-xs">{counts.failed} failed</Badge>
        )}
        {counts.active === 0 && counts.waiting === 0 && counts.delayed === 0 && counts.failed === 0 && (
          <span className="text-muted-foreground">idle</span>
        )}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: analyticsApi.getDashboard,
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="mb-2 h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  const stats = data?.stats
  const postsOverTime = data?.postsOverTime ?? []
  const recentActivity = data?.recentActivity ?? []
  const todayProgress = data?.todayProgress ?? { postsCompleted: 0, postsTarget: 0 }
  const queueStatus = data?.queueStatus

  const chartData = postsOverTime.map((d) => ({
    ...d,
    date: format(new Date(d.date), 'MMM d'),
  }))

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total Sites"
          value={stats?.totalSites ?? 0}
          icon={Globe}
        />
        <StatCard
          label="Active Sites"
          value={stats?.activeSites ?? 0}
          icon={Globe}
          description={stats?.errorSites ? `${stats.errorSites} with errors` : 'Currently healthy'}
        />
        <StatCard
          label="Total Articles"
          value={stats?.totalArticles ?? 0}
          icon={FileText}
        />
        <StatCard
          label="Success Rate"
          value={`${stats?.successRate ?? 0}%`}
          icon={TrendingUp}
          description="Post success"
        />
        <StatCard
          label="Active Schedules"
          value={stats?.activeSchedules ?? 0}
          icon={Clock}
        />
        <StatCard
          label="Total Cost"
          value={`$${(stats?.totalCost ?? 0).toFixed(2)}`}
          icon={DollarSign}
          description="AI generation cost"
        />
      </div>

      {/* Today's progress & Queue status */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Today's Progress</CardTitle>
            <CardDescription>Posts completed across all active sites</CardDescription>
          </CardHeader>
          <CardContent>
            <ProgressBar completed={todayProgress.postsCompleted} target={todayProgress.postsTarget} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Queue Pipeline</CardTitle>
            <CardDescription>Current processing status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <QueueWidget label="Article Generation" counts={queueStatus?.articleGeneration ?? null} />
            <QueueWidget label="WordPress Posting" counts={queueStatus?.wordpressPosting ?? null} />
            <QueueWidget label="Scheduled Execution" counts={queueStatus?.scheduledExecution ?? null} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Posts over time */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Posts Over Time</CardTitle>
            <CardDescription>Last 30 days posting activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: 'hsl(var(--popover-foreground))',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Posts"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <CardDescription>Last 20 posting events</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentActivity.length === 0 && (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  No recent activity
                </p>
              )}
              {recentActivity.slice(0, 10).map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-6 py-3">
                  {item.status === 'posted' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                  ) : item.status === 'failed' ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  ) : (
                    <Activity className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{item.articleTitle}</p>
                    <p className="text-xs text-muted-foreground">{item.siteName}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(item.postedAt), 'MMM d, HH:mm')}
                    </p>
                  </div>
                  <Badge
                    variant={
                      item.status === 'posted'
                        ? 'success'
                        : item.status === 'failed'
                        ? 'destructive'
                        : 'warning'
                    }
                    className="text-xs"
                  >
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Post log table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Post Log</CardTitle>
          <CardDescription>Detailed recent posting activity</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Article</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Posted At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentActivity.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No activity yet
                  </TableCell>
                </TableRow>
              )}
              {recentActivity.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <span className="block max-w-[280px] truncate">{item.articleTitle}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.siteName}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.status === 'posted'
                          ? 'success'
                          : item.status === 'failed'
                          ? 'destructive'
                          : 'warning'
                      }
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(item.postedAt), 'MMM d, HH:mm')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
