import { lazy } from 'react';

const loaders = {
  JoinGroup: () => import('../pages/JoinGroup'),
  Dashboard: () => import('../pages/Dashboard'),
  MyTasks: () => import('../pages/MyTasks'),
  Groups: () => import('../pages/Groups'),
  GroupDetail: () => import('../pages/GroupDetail'),
  ActivityLogPage: () => import('../pages/ActivityLogPage'),
  MemberDetail: () => import('../pages/MemberDetail'),
  ProjectDetail: () => import('../pages/ProjectDetail'),
  TaskDetail: () => import('../pages/TaskDetail'),
  Notifications: () => import('../pages/Notifications'),
  Profile: () => import('../pages/Profile'),
  Settings: () => import('../pages/Settings'),
  Marketplace: () => import('../pages/Marketplace'),
  Calendar: () => import('../pages/Calendar'),
} as const;

export const JoinGroup = lazy(loaders.JoinGroup);
export const Dashboard = lazy(loaders.Dashboard);
export const MyTasks = lazy(loaders.MyTasks);
export const Groups = lazy(loaders.Groups);
export const GroupDetail = lazy(loaders.GroupDetail);
export const ActivityLogPage = lazy(loaders.ActivityLogPage);
export const MemberDetail = lazy(loaders.MemberDetail);
export const ProjectDetail = lazy(loaders.ProjectDetail);
export const TaskDetail = lazy(loaders.TaskDetail);
export const Notifications = lazy(loaders.Notifications);
export const Profile = lazy(loaders.Profile);
export const Settings = lazy(loaders.Settings);
export const Marketplace = lazy(loaders.Marketplace);
export const Calendar = lazy(loaders.Calendar);

export const DevMailbox = lazy(() => import('../pages/DevMailbox'));

let prefetched = false;

export function prefetchProtectedPages(): void {
  if (prefetched) return;
  prefetched = true;
  for (const load of Object.values(loaders)) void load().catch(() => undefined);
}
