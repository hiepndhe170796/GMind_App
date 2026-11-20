import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { ToastProvider } from './components/ui/Toast';
import { createQueryClient } from './services/query-client';
import { getSessionSnapshot, subscribeSession } from './services/session';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import JoinGroup from './pages/JoinGroup';
import Dashboard from './pages/Dashboard';
import GroupDetail from './pages/GroupDetail';
import ActivityLogPage from './pages/ActivityLogPage';
import MemberDetail from './pages/MemberDetail';
import Groups from './pages/Groups';
import ProjectDetail from './pages/ProjectDetail';
import TaskDetail from './pages/TaskDetail';
import MyTasks from './pages/MyTasks';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import Marketplace from './pages/Marketplace';
import Calendar from './pages/Calendar';

/**
 * One QueryClient per app. Cached data is cleared whenever the signed-in user
 * changes or logs out so no data leaks between accounts.
 */
function SessionBoundQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  const userIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const sync = () => {
      const id = getSessionSnapshot()?.user.id ?? null;
      if (userIdRef.current === undefined) { userIdRef.current = id; return; }
      if (userIdRef.current !== id) {
        userIdRef.current = id;
        client.clear();
      }
    };
    sync();
    return subscribeSession(sync);
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function App() {
  return (
    <SessionBoundQueryProvider>
    <BrowserRouter>
      <ToastProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/join-group" element={<JoinGroup />} />
          <Route path="/join/:code" element={<JoinGroup />} />
          <Route path="/groups/:id/activity" element={<ActivityLogPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:id" element={<GroupDetail />} />
          <Route path="/groups/:groupId/members/:userId" element={<MemberDetail />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/groups/:groupId/marketplace" element={<Marketplace />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/my-tasks" element={<MyTasks />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      </ToastProvider>
    </BrowserRouter>
    </SessionBoundQueryProvider>
  );
}

export default App;
