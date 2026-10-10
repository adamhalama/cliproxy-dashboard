import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import TailnetApp from '@/features/tailnet/TailnetApp';

document.title = 'CLI Proxy · Quota dashboard';
document.documentElement.lang = 'en';
const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (favicon) {
  favicon.href = INLINE_LOGO_JPEG;
  favicon.type = 'image/jpeg';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TailnetApp />
  </StrictMode>
);
