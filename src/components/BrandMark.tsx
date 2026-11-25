import React from 'react';

interface BrandMarkProps {
  logoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  inverted?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  logoUrl,
  size = 'md',
  inverted = false,
}) => {
  const dimensions =
    size === 'sm' ? 'h-8 w-8 text-sm' : size === 'lg' ? 'h-12 w-12 text-xl' : 'h-10 w-10 text-base';

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="Logo Cafe"
        referrerPolicy="no-referrer"
        className={`${dimensions} shrink-0 rounded-xl object-cover border border-[#E8E6DF] bg-white`}
      />
    );
  }

  return (
    <div
      className={`${dimensions} shrink-0 rounded-xl flex items-center justify-center font-extrabold tracking-tight select-none ${
        inverted
          ? 'bg-[#FCD804] text-[#1B4D3E]'
          : 'bg-[#1B4D3E] text-[#FCD804]'
      }`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        className="w-[62%] h-[62%]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M7 11H21V18C21 21.866 17.866 25 14 25C10.134 25 7 21.866 7 18V11Z"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <path
          d="M21 13H23.5C25.1569 13 26.5 14.3431 26.5 16C26.5 17.6569 25.1569 19 23.5 19H21"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M11 6.5V8M14.5 5.5V8M18 6.5V8"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
