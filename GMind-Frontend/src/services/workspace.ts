import { tasksService, hasTaskDetails } from './tasks';
import { projectsService } from './projects';
import { groupsService } from './groups';
import { dashboardService } from './dashboard';

export async function loadTaskWorkspace(id: string) {
  const task = await tasksService.get(id);
  const project = await projectsService.get(task.projectId);
  const group = await groupsService.get(project.groupId);
  const [comments, links, reviews] = hasTaskDetails(task)
    ? await Promise.all([tasksService.comments(id), tasksService.links(id), tasksService.reviews(id)])
    : [[], [], []];
  return { task, comments, links, reviews, myRole: group.myRole };
}

export async function loadGroupWorkspace(id: string) {
  const group = await groupsService.get(id);
  const [projects, progress, activity] = await Promise.all([
    projectsService.list(id),
    group.myRole === 'Leader' ? dashboardService.groupProgress(id) : Promise.resolve(null),
    group.myRole === 'Leader' ? groupsService.activity(id) : Promise.resolve([]),
  ]);
  return { group, projects, progress, activity };
}
