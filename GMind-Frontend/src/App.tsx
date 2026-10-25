import Button from './components/ui/Button';
import Input from './components/ui/Input';
import Card from './components/ui/Card';
import Badge from './components/ui/Badge';
import LoadingSpinner from './components/ui/LoadingSpinner';
import MainLayout from './layouts/MainLayout';

function App() {
  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
            GMind Design System Demo
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Demo các UI components cơ bản
          </p>
        </div>

        {/* Buttons */}
        <Card>
          <h2 className="text-2xl font-semibold mb-4">Buttons</h2>
          <div className="flex flex-wrap gap-4">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="success">Success</Button>
            <Button variant="warning">Warning</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="primary" isLoading>Loading</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap gap-4 mt-4">
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="primary" size="md">Medium</Button>
            <Button variant="primary" size="lg">Large</Button>
          </div>
        </Card>

        {/* Inputs */}
        <Card>
          <h2 className="text-2xl font-semibold mb-4">Inputs</h2>
          <div className="space-y-4 max-w-md">
            <Input label="Email" type="email" placeholder="user@example.com" />
            <Input label="Password" type="password" placeholder="••••••••" />
            <Input label="With Error" error="This field is required" />
            <Input placeholder="Without label" />
          </div>
        </Card>

        {/* Badges */}
        <Card>
          <h2 className="text-2xl font-semibold mb-4">Badges</h2>
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">Primary</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="neutral">Neutral</Badge>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="primary" size="sm">Small</Badge>
            <Badge variant="primary" size="md">Medium</Badge>
          </div>
        </Card>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card variant="default">
            <h3 className="text-lg font-semibold mb-2">Default Card</h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              Card với border và background mặc định
            </p>
          </Card>
          <Card variant="outlined">
            <h3 className="text-lg font-semibold mb-2">Outlined Card</h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              Card với border 2px và background transparent
            </p>
          </Card>
          <Card variant="elevated">
            <h3 className="text-lg font-semibold mb-2">Elevated Card</h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              Card với shadow nâng cao
            </p>
          </Card>
        </div>

        {/* Loading Spinner */}
        <Card>
          <h2 className="text-2xl font-semibold mb-4">Loading Spinner</h2>
          <div className="flex items-center gap-8">
            <LoadingSpinner size="sm" />
            <LoadingSpinner size="md" />
            <LoadingSpinner size="lg" />
          </div>
        </Card>

        {/* Auth Layout Demo */}
        <Card>
          <h2 className="text-2xl font-semibold mb-4">Auth Layout Preview</h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            AuthLayout được dùng cho trang đăng nhập/đăng ký với gradient background
          </p>
          <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
            <div className="text-center">
              <h3 className="text-3xl font-bold text-primary-600 mb-2">GMind</h3>
              <p className="text-neutral-600 dark:text-neutral-400">Quản lý dự án nhóm sinh viên</p>
            </div>
          </div>
        </Card>
      </div>
    </MainLayout>
  );
}

export default App;
