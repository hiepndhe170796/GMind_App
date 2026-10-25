import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import JoinGroup from './pages/JoinGroup';
import Dashboard from './pages/Dashboard';
import GroupDetail from './pages/GroupDetail';
import ProjectDetail from './pages/ProjectDetail';
import TaskDetail from './pages/TaskDetail';
import MyTasks from './pages/MyTasks';
import Notifications from './pages/Notifications';
import Marketplace from './pages/Marketplace';
import Calendar from './pages/Calendar';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/join-group" element={<JoinGroup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/groups/:groupId/marketplace" element={<Marketplace />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/my-tasks" element={<MyTasks />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
