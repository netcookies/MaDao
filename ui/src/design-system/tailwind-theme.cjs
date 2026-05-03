const dsColor = (token) => `var(--ds-color-${token})`;
const dsRadius = (token) => `var(--ds-radius-${token})`;
const dsSpace = (token) => `var(--ds-space-${token})`;
const dsSize = (token) => `var(--ds-size-${token})`;
const dsType = (token) => `var(--ds-type-${token})`;
const dsMotion = (token) => `var(--ds-motion-${token})`;

// Tailwind is a consumer of design tokens, not a second token source.
// All values here should resolve to existing `--ds-*` variables from theme.css.
module.exports = {
  colors: {
    ds: {
      window: dsColor('window-bg'),
      sidebar: dsColor('sidebar-bg'),
      content: dsColor('content-bg'),
      surface: {
        DEFAULT: dsColor('surface-default'),
        subtle: dsColor('surface-subtle'),
        chip: dsColor('surface-chip'),
      },
      border: {
        DEFAULT: dsColor('border-default'),
        strong: dsColor('border-strong'),
      },
      text: {
        primary: dsColor('text-primary'),
        secondary: dsColor('text-secondary'),
      },
      accent: {
        blue: dsColor('accent-blue'),
        focus: dsColor('accent-blue-focus'),
        soft: dsColor('accent-blue-soft'),
      },
      state: {
        success: dsColor('state-success'),
        successSoft: dsColor('state-success-soft'),
        warning: dsColor('state-warning'),
        warningSoft: dsColor('state-warning-soft'),
        danger: dsColor('state-danger'),
      },
    },
  },
  borderRadius: {
    xs: dsRadius('xs'),
    sm: dsRadius('sm'),
    md: dsRadius('md'),
    lg: dsRadius('lg'),
    pill: dsRadius('pill'),
  },
  spacing: {
    'ds-xxs': dsSpace('xxs'),
    'ds-xs': dsSpace('xs'),
    'ds-sm': dsSpace('sm'),
    'ds-md': dsSpace('md'),
    'ds-lg': dsSpace('lg'),
    'ds-xl': dsSpace('xl'),
    'ds-xxl': dsSpace('xxl'),
    'ds-section': dsSpace('section'),
    'control-x': dsSpace('control-x'),
    'control-x-compact': dsSpace('control-x-compact'),
  },
  width: {
    sidebar: dsSize('sidebar-width'),
    notification: dsSize('notification-panel-width'),
    activation: dsSize('activation-modal-width'),
  },
  maxWidth: {
    activation: dsSize('activation-modal-width'),
  },
  height: {
    toolbar: dsSize('toolbar-height'),
    control: dsSize('control-default'),
    'control-compact': dsSize('control-compact'),
  },
  minHeight: {
    control: dsSize('control-default'),
    'control-compact': dsSize('control-compact'),
  },
  fontFamily: {
    text: ['var(--ds-font-family-text)'],
    display: ['var(--ds-font-family-display)'],
  },
  fontSize: {
    'page-title': [dsType('page-title-size'), {
      lineHeight: dsType('page-title-line-height'),
      letterSpacing: dsType('page-title-tracking'),
      fontWeight: dsType('page-title-weight'),
    }],
    'section-title': [dsType('section-title-size'), {
      lineHeight: dsType('section-title-line-height'),
      letterSpacing: dsType('section-title-tracking'),
      fontWeight: dsType('section-title-weight'),
    }],
    body: [dsType('body-size'), {
      lineHeight: dsType('body-line-height'),
      letterSpacing: dsType('body-tracking'),
      fontWeight: dsType('body-weight'),
    }],
    'body-strong': [dsType('body-strong-size'), {
      lineHeight: dsType('body-strong-line-height'),
      letterSpacing: dsType('body-strong-tracking'),
      fontWeight: dsType('body-strong-weight'),
    }],
    utility: [dsType('utility-size'), {
      lineHeight: dsType('utility-line-height'),
      letterSpacing: dsType('utility-tracking'),
      fontWeight: dsType('utility-weight'),
    }],
    'utility-strong': [dsType('utility-strong-size'), {
      lineHeight: dsType('utility-strong-line-height'),
      letterSpacing: dsType('utility-strong-tracking'),
      fontWeight: dsType('utility-strong-weight'),
    }],
    caption: [dsType('caption-size'), {
      lineHeight: dsType('caption-line-height'),
      letterSpacing: dsType('caption-tracking'),
      fontWeight: dsType('caption-weight'),
    }],
  },
  boxShadow: {
    ds: 'var(--ds-effect-shadow-default)',
    modal: 'var(--ds-effect-shadow-modal)',
  },
  backdropBlur: {
    ds: 'var(--ds-effect-backdrop-blur)',
  },
  transitionDuration: {
    fast: '180ms',
  },
  transitionTimingFunction: {
    ds: dsMotion('transition-fast'),
  },
  scale: {
    press: dsMotion('press-scale'),
  },
};
