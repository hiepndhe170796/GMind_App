# GMind Design Tokens

Đây là tài liệu định nghĩa design tokens cho GMind. Design tokens là các giá trị dùng lại trong toàn bộ ứng dụng để đảm bảo tính nhất quán.

## Colors

### Primary Colors (Blue)
Sử dụng cho hành động chính, call-to-action, và elements quan trọng.

```
primary-50:  #eff6ff
primary-100: #dbeafe
primary-200: #bfdbfe
primary-300: #93c5fd
primary-400: #60a5fa
primary-500: #3b82f6  (Main primary color)
primary-600: #2563eb  (Hover state)
primary-700: #1d4ed8
primary-800: #1e40af
primary-900: #1e3a8a
```

### Secondary Colors (Purple)
Sử dụng cho accent, highlights, và elements phụ.

```
secondary-50:  #faf5ff
secondary-100: #f3e8ff
secondary-200: #e9d5ff
secondary-300: #d8b4fe
secondary-400: #c084fc
secondary-500: #a855f7  (Main secondary color)
secondary-600: #9333ea  (Hover state)
secondary-700: #7e22ce
secondary-800: #6b21a8
secondary-900: #581c87
```

### Semantic Colors

#### Success (Green)
Sử dụng cho success states, completed tasks, positive feedback.

```
success-50:  #f0fdf4
success-100: #dcfce7
success-200: #bbf7d0
success-300: #86efac
success-400: #4ade80
success-500: #22c55e  (Main success color)
success-600: #16a34a
success-700: #15803d
success-800: #166534
success-900: #14532d
```

#### Warning (Amber/Orange)
Sử dụng cho warning states, deadline approaching, attention needed.

```
warning-50:  #fffbeb
warning-100: #fef3c7
warning-200: #fde68a
warning-300: #fcd34d
warning-400: #fbbf24
warning-500: #f59e0b  (Main warning color)
warning-600: #d97706
warning-700: #b45309
warning-800: #92400e
warning-900: #78350f
```

#### Danger (Red)
Sử dụng cho error states, overdue tasks, destructive actions.

```
danger-50:  #fef2f2
danger-100: #fee2e2
danger-200: #fecaca
danger-300: #fca5a5
danger-400: #f87171
danger-500: #ef4444  (Main danger color)
danger-600: #dc2626
danger-700: #b91c1c
danger-800: #991b1b
danger-900: #7f1d1d
```

### Neutral Colors (Gray)
Sử dụng cho text, backgrounds, borders, và non-interactive elements.

```
neutral-50:  #fafafa  (Background light)
neutral-100: #f5f5f5  (Background secondary)
neutral-200: #e5e5e5  (Border default)
neutral-300: #d4d4d4
neutral-400: #a3a3a3
neutral-500: #737373  (Text secondary)
neutral-600: #525252
neutral-700: #404040  (Text primary light)
neutral-800: #262626
neutral-900: #171717  (Text primary dark)
neutral-950: #0a0a0a  (Background dark)
```

## Typography

### Font Families

```
Sans-serif: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
Mono: JetBrains Mono, Fira Code, Consolas, monospace
```

### Font Sizes

```
xs:  0.75rem   (12px)
sm:  0.875rem  (14px)
base: 1rem     (16px)
lg:  1.125rem  (18px)
xl:  1.25rem   (20px)
2xl: 1.5rem    (24px)
3xl: 1.875rem  (30px)
4xl: 2.25rem   (36px)
5xl: 3rem     (48px)
```

### Font Weights

```
normal: 400
medium: 500
semibold: 600
bold: 700
```

### Line Heights

```
tight: 1.25
normal: 1.5
relaxed: 1.75
```

## Spacing

```
xs:   0.25rem  (4px)
sm:   0.5rem   (8px)
md:   1rem     (16px)
lg:   1.5rem   (24px)
xl:   2rem     (32px)
2xl:  3rem     (48px)
3xl:  4rem     (64px)
4xl:  6rem     (96px)
5xl:  8rem     (128px)
```

## Border Radius

```
sm:   0.25rem  (4px)
md:   0.375rem (6px)
lg:   0.5rem   (8px)
xl:   0.75rem  (12px)
2xl:  1rem     (16px)
3xl:  1.5rem   (24px)
full: 9999px   (Round)
```

## Shadows

```
sm:  0 1px 2px 0 rgb(0 0 0 / 0.05)
md:  0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)
lg:  0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)
xl:  0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)
```

## Component States

### Button States

**Primary Button:**
- Default: primary-600 background, white text
- Hover: primary-700 background
- Focus: primary-500 ring
- Disabled: 50% opacity

**Ghost Button:**
- Default: transparent background, neutral-700 text
- Hover: neutral-100 background
- Focus: neutral-500 ring

### Input States

**Default:**
- Border: neutral-300
- Background: white (light mode), neutral-900 (dark mode)
- Text: neutral-900 (light mode), neutral-100 (dark mode)

**Focus:**
- Border: transparent
- Ring: primary-500

**Error:**
- Border: danger-500
- Ring: danger-500
- Error text: danger-600

### Card States

**Default Card:**
- Background: white (light mode), neutral-900 (dark mode)
- Border: neutral-200 (light mode), neutral-800 (dark mode)
- Padding: 1.5rem (24px)
- Border radius: 0.75rem (12px)

**Elevated Card:**
- Same as default + shadow-lg

## Usage Guidelines

### Color Usage

1. **Primary colors** chỉ dùng cho actions chính (submit, save, create)
2. **Secondary colors** dùng cho accent, badges, highlights
3. **Success** dùng cho completed states, success messages
4. **Warning** dùng cho deadline gần, attention needed
5. **Danger** dùng cho delete actions, error states, overdue tasks
6. **Neutral** dùng cho text, backgrounds, borders

### Typography Usage

1. **H1 (4xl, bold)** - Page titles
2. **H2 (3xl, semibold)** - Section titles
3. **H3 (2xl, semibold)** - Card titles
4. **Body (base, normal)** - Regular text
5. **Small (sm, normal)** - Secondary text, labels
6. **Caption (xs, normal)** - Helper text, metadata

### Spacing Usage

1. **xs** - Tight spacing, icons in buttons
2. **sm** - Compact spacing, badge padding
3. **md** - Default spacing, card padding
4. **lg** - Section spacing, gaps between elements
5. **xl** - Large spacing, page margins
6. **2xl+** - Extra large spacing, major sections

## Dark Mode

Tất cả colors đều có dark mode variants thông qua Tailwind's dark mode:
- Background colors chuyển sang neutral-950, neutral-900
- Text colors chuyển sang neutral-100, neutral-300
- Semantic colors có dark variants với độ sáng giảm
