import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from '@/components/layout/MainLayout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SitesPage } from '@/pages/SitesPage'
import { ArticlesPage } from '@/pages/ArticlesPage'
import { PostsPage } from '@/pages/PostsPage'
import { SchedulesPage } from '@/pages/SchedulesPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { BacklinksPage } from '@/pages/BacklinksPage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<MainLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/sites" element={<SitesPage />} />
        <Route path="/articles" element={<ArticlesPage />} />
        <Route path="/posts" element={<PostsPage />} />
        <Route path="/schedules" element={<SchedulesPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/backlinks" element={<BacklinksPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
