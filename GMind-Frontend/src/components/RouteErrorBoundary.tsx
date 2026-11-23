import { Component, type ErrorInfo, type ReactNode } from 'react';
import MainLayout from '../layouts/MainLayout';
import Button from './ui/Button';
import { ErrorState } from './workspace/WorkspaceUI';

export default class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    console.error('Route render failed', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <MainLayout>
          <ErrorState message="Không tải được trang. Có thể ứng dụng vừa được cập nhật — tải lại trang để tiếp tục." />
          <div className="mt-3">
            <Button onClick={() => window.location.reload()}>Tải lại trang</Button>
          </div>
        </MainLayout>
      );
    }
    return this.props.children;
  }
}
