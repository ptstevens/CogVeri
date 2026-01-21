/**
 * GoogleSignInButton Component
 *
 * STRICTLY implements Google's Sign-In branding guidelines:
 * https://developers.google.com/identity/branding-guidelines
 *
 * Exact specifications (Light Theme):
 * - Fill: #FFFFFF
 * - Stroke: #747775 (1px, inside)
 * - Font: Roboto Medium, 14px/20px line-height
 * - Text color: #1F1F1F
 * - Padding: 12px left, 10px after logo, 12px right
 * - Height: 40px (standard)
 * - Border radius: 4px
 */

import { ButtonHTMLAttributes } from 'react';

interface GoogleSignInButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button text variant */
  variant?: 'signin' | 'signup' | 'continue';
  /** Whether the button is in a loading state */
  isLoading?: boolean;
  /** Full width button */
  fullWidth?: boolean;
}

const GoogleSignInButton = ({
  variant = 'continue',
  isLoading = false,
  fullWidth = true,
  disabled,
  className = '',
  ...props
}: GoogleSignInButtonProps) => {
  const buttonText = {
    signin: 'Sign in with Google',
    signup: 'Sign up with Google',
    continue: 'Continue with Google',
  }[variant];

  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      className={`
        inline-flex items-center justify-center
        h-10
        bg-white
        border border-[#747775]
        rounded
        shadow-sm
        transition-colors duration-150
        hover:bg-[#f8f9fa] hover:border-[#747775]
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4285f4]
        active:bg-[#f1f3f4]
        disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      style={{
        fontFamily: '"Roboto", "Google Sans", system-ui, -apple-system, sans-serif',
        paddingLeft: '12px',
        paddingRight: '12px',
      }}
      {...props}
    >
      {/* Logo container with white background - 18x18px logo with padding */}
      <span
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: '18px',
          height: '18px',
          marginRight: '10px',
        }}
      >
        {isLoading ? (
          <svg
            className="animate-spin"
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
          >
            <circle
              cx="9"
              cy="9"
              r="7"
              stroke="#dadce0"
              strokeWidth="2"
            />
            <path
              d="M9 2a7 7 0 0 1 7 7"
              stroke="#4285f4"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          /* Google "G" Logo - Official brand colors, 18x18 */
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            aria-hidden="true"
          >
            <path
              fill="#4285F4"
              d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18Z"
            />
            <path
              fill="#34A853"
              d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17Z"
            />
            <path
              fill="#FBBC05"
              d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07Z"
            />
            <path
              fill="#EA4335"
              d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3Z"
            />
          </svg>
        )}
      </span>

      {/* Button text - Roboto Medium, 14px, #1F1F1F */}
      <span
        style={{
          fontSize: '14px',
          fontWeight: 500,
          lineHeight: '20px',
          color: '#1f1f1f',
          letterSpacing: '0.25px',
        }}
      >
        {isLoading ? 'Connecting...' : buttonText}
      </span>
    </button>
  );
};

export default GoogleSignInButton;
