type IconProps = {
  size?: number;
  className?: string;
};

const iconProps = (size = 24, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className
});

export const LaptopIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M2 20h20" />
    <path d="M8 20h8" />
  </svg>
);

export const UserIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.8-3.5 5-5 8-5s6.2 1.5 8 5" />
  </svg>
);

export const UsersIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <circle cx="8" cy="8" r="3" />
    <circle cx="16" cy="9" r="3" />
    <path d="M2.5 20c.8-3 3.5-4.5 5.5-4.5" />
    <path d="M11 20c1-3.4 3.7-5.5 6.5-5.5" />
  </svg>
);

export const ClassIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <circle cx="7" cy="9" r="3" />
    <circle cx="17" cy="9" r="3" />
    <path d="M2 20c1-3 3.2-4.5 5-4.5" />
    <path d="M22 20c-1-3-3.2-4.5-5-4.5" />
    <path d="M9 20c1.5-3.5 4-5.5 6-5.5" />
  </svg>
);

export const ClockIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6l4 2" />
  </svg>
);

export const HistoryIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const ShieldIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
  </svg>
);

export const ChartIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <path d="M4 20h16" />
    <path d="M7 16v-5" />
    <path d="M12 16V8" />
    <path d="M17 16v-3" />
  </svg>
);

export const CheckIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <path d="M20 6l-11 11-5-5" />
  </svg>
);

export const ReturnIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <path d="M9 10H4V5" />
    <path d="M4 10c2-4 6-6 10-4" />
    <path d="M15 14h5v5" />
    <path d="M20 14c-2 4-6 6-10 4" />
  </svg>
);

export const AlertIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <path d="M12 4l9 16H3L12 4z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

export const PlusIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

export const TrashIcon = ({ size, className }: IconProps) => (
  <svg {...iconProps(size, className)}>
    <path d="M4 7h16" />
    <path d="M9 7V5h6v2" />
    <path d="M7 7l1 12h8l1-12" />
  </svg>
);
