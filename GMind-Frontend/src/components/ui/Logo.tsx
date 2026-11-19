const sizes = { sm: 'h-8 w-8 text-base', md: 'h-9 w-9 text-lg', lg: 'h-11 w-11 text-xl' } as const;
const tones = {
  brand: 'bg-gradient-to-br from-primary-600 to-accent-600 text-white',
  onDark: 'bg-white text-primary-700',
} as const;

export default function Logo({ size = 'md', tone = 'brand' }: { size?: keyof typeof sizes; tone?: keyof typeof tones }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-xl font-bold ${sizes[size]} ${tones[tone]}`}>G</span>
  );
}
