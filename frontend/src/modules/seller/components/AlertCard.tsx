import { ReactNode } from 'react';

interface AlertCardProps {
  icon: ReactNode;
  title: string;
  value: number;
  accentColor: string;
  onClick?: () => void;
}

export default function AlertCard({ icon, title, value, accentColor, onClick }: AlertCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg shadow-sm border border-neutral-200 p-3 sm:p-4 md:p-5 transition-all duration-150
        ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-95 select-none' : ''}`}
    >
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="p-2 sm:p-3 rounded-lg flex-shrink-0" style={{ backgroundColor: `${accentColor}20` }}>
            <div style={{ color: accentColor }} className="w-6 h-6 sm:w-8 sm:h-8">{icon}</div>
          </div>
          <div>
            <h3 className="text-neutral-600 text-xs sm:text-sm font-medium mb-1">{title}</h3>
            <p className="text-xl sm:text-2xl font-bold" style={{ color: accentColor }}>
              {value}
            </p>
          </div>
        </div>
        {onClick && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-neutral-300 flex-shrink-0"
          >
            <path
              d="M9 18L15 12L9 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

