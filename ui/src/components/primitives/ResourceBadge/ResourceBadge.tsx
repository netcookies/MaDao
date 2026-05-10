import { useState, type CSSProperties, type ReactNode } from 'react';
import { Bot, MessageCircleMore, Puzzle, Server, Send } from 'lucide-react';
import * as flags from 'country-flag-icons/react/3x2';
import {
  siDiscord,
  siGooglemessages,
  siPaypal,
  siWhatsapp,
  type SimpleIcon,
} from 'simple-icons';
import { cx } from '../../../lib/cx';
import fivesimIcon from '../../../assets/providers/fivesim.ico';
import smsbowerIcon from '../../../assets/providers/smsbower.ico';

type ResourceKind = 'provider' | 'service' | 'country';

const COUNTRY_CODE_MAP: Record<string, keyof typeof flags> = {
  ar: 'AR',
  argentina: 'AR',
  au: 'AU',
  australia: 'AU',
  'bosnia and herzegovina': 'BA',
  bih: 'BA',
  br: 'BR',
  brazil: 'BR',
  ca: 'CA',
  canada: 'CA',
  cn: 'CN',
  china: 'CN',
  de: 'DE',
  deutschland: 'DE',
  germany: 'DE',
  england: 'GB',
  gb: 'GB',
  uk: 'GB',
  '44': 'GB',
  id: 'ID',
  indonesia: 'ID',
  in: 'IN',
  india: 'IN',
  jp: 'JP',
  japan: 'JP',
  jo: 'JO',
  jordan: 'JO',
  kz: 'KZ',
  kazakhstan: 'KZ',
  mk: 'MK',
  'north macedonia': 'MK',
  mx: 'MX',
  mexico: 'MX',
  my: 'MY',
  malaysia: 'MY',
  nl: 'NL',
  netherlands: 'NL',
  ph: 'PH',
  philippines: 'PH',
  kr: 'KR',
  'south korea': 'KR',
  kp: 'KP',
  'north korea': 'KP',
  ru: 'RU',
  russia: 'RU',
  '0': 'RU',
  za: 'ZA',
  southafrica: 'ZA',
  'south africa': 'ZA',
  sg: 'SG',
  singapore: 'SG',
  th: 'TH',
  thailand: 'TH',
  tr: 'TR',
  turkey: 'TR',
  tt: 'TT',
  'trinidad and tobago': 'TT',
  us: 'US',
  usa: 'US',
  '50': 'US',
  vn: 'VN',
  vietnam: 'VN',
};

const SERVICE_ICON_MAP: Record<string, SimpleIcon> = {
  discord: siDiscord,
  googlemessages: siGooglemessages,
  paypal: siPaypal,
  wa: siWhatsapp,
  whatsapp: siWhatsapp,
};

const PROVIDER_ICON_MAP: Record<string, { imageSrc?: string; label: string; backgroundClass: string; textClass: string }> = {
  fivesim: {
    imageSrc: fivesimIcon,
    label: '5',
    backgroundClass: 'bg-white',
    textClass: 'text-[#1f6feb]',
  },
  herosms: {
    label: 'H',
    backgroundClass: 'bg-[#f97316]/12',
    textClass: 'text-[#ea580c]',
  },
  smsbower: {
    imageSrc: smsbowerIcon,
    label: 'S',
    backgroundClass: 'bg-white',
    textClass: 'text-[#0f766e]',
  },
};

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function titleInitial(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : '?';
}

function iconSvg(simpleIcon: SimpleIcon) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-full w-full"
      fill="currentColor"
    >
      <path d={simpleIcon.path} />
    </svg>
  );
}

function ProviderGlyph(props: { provider: string }) {
  const provider = normalizeValue(props.provider);
  const config = PROVIDER_ICON_MAP[provider];

  if (config?.imageSrc) {
    return (
      <img
        src={config.imageSrc}
        alt=""
        className="h-full w-full rounded-[inherit] object-contain"
      />
    );
  }

  return (
    <span
      className={cx(
        'flex h-full w-full items-center justify-center rounded-[inherit] text-[12px] font-semibold leading-none',
        config?.backgroundClass ?? 'bg-ds-surface-subtle',
        config?.textClass ?? 'text-ds-text-primary',
      )}
    >
      {config?.label ?? titleInitial(props.provider)}
    </span>
  );
}

function ExternalImageGlyph(props: { src: string; onError?: () => void }) {
  return (
    <img
      src={props.src}
      alt=""
      className="h-full w-full rounded-[inherit] object-contain"
      onError={props.onError}
    />
  );
}

function ServiceGlyph(props: { service: string }) {
  const service = normalizeValue(props.service);
  const icon = SERVICE_ICON_MAP[service];

  if (icon) {
    return (
      <span
        className="flex h-full w-full items-center justify-center rounded-[inherit]"
        style={{ color: `#${icon.hex}` } satisfies CSSProperties}
      >
        {iconSvg(icon)}
      </span>
    );
  }

  if (service.includes('telegram') || service === 'tg') {
    return <Send size={14} className="opacity-80" />;
  }
  if (service.includes('wechat')) {
    return <MessageCircleMore size={14} className="opacity-80" />;
  }
  if (service.includes('message') || service.includes('sms')) {
    return <MessageCircleMore size={14} className="opacity-80" />;
  }
  if (service.includes('bot') || service.includes('gpt') || service.includes('openai') || service.includes('chat')) {
    return <Bot size={14} className="opacity-80" />;
  }
  return <Puzzle size={14} className="opacity-70" />;
}

function CountryGlyph(props: { country: string }) {
  const country = normalizeValue(props.country);
  const code = COUNTRY_CODE_MAP[country];
  if (!code) {
    return (
      <span className="flex h-full w-full items-center justify-center rounded-[inherit] bg-ds-surface-subtle text-[10px] font-semibold leading-none text-ds-text-secondary">
        {country === 'any' ? 'ALL' : titleInitial(props.country)}
      </span>
    );
  }

  const Flag = flags[code];
  return <Flag aria-hidden className="h-full w-full rounded-[inherit] object-cover" />;
}

export function ResourceBadge(props: {
  kind: ResourceKind;
  value: string;
  size?: 'sm' | 'md';
  className?: string;
  iconUrl?: string | null;
}) {
  const [externalImageFailed, setExternalImageFailed] = useState(false);
  const sizeClass = props.size === 'sm'
    ? 'h-4 w-4 rounded-[4px]'
    : 'h-5 w-5 rounded-[5px]';

  let glyph: ReactNode = null;
  if (props.iconUrl && !externalImageFailed) {
    glyph = <ExternalImageGlyph src={props.iconUrl} onError={() => setExternalImageFailed(true)} />;
  }
  else if (props.kind === 'provider') glyph = <ProviderGlyph provider={props.value} />;
  else if (props.kind === 'service') glyph = <ServiceGlyph service={props.value} />;
  else if (props.kind === 'country') glyph = <CountryGlyph country={props.value} />;

  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden border border-ds-border bg-ds-surface-subtle shadow-[0_1px_2px_rgba(0,0,0,0.06)]',
        sizeClass,
        props.kind === 'service' && 'p-[3px]',
        props.className,
      )}
      aria-hidden="true"
    >
      {glyph ?? <Server size={14} className="opacity-70" />}
    </span>
  );
}
