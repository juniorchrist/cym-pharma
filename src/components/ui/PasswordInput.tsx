import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  hasLeftIcon?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  hasLeftIcon = true,
  className = '',
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative flex items-center">
      {hasLeftIcon && (
        <span className="absolute left-3.5 text-slate-400 pointer-events-none">
          <Lock className="w-4 h-4" strokeWidth={1.75} />
        </span>
      )}
      <input
        id={id}
        type={showPassword ? 'text' : 'password'}
        className={`w-full h-11 pr-11 border-1.5 border-slate-200 bg-slate-50 text-slate-900 text-sm rounded-xl outline-none focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-[rgba(21,94,149,0.12)] transition ${
          hasLeftIcon ? 'pl-11' : 'px-4'
        } ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute right-3.5 text-slate-400 hover:text-slate-700 transition cursor-pointer"
      >
        {showPassword ? (
          <EyeOff className="w-4 h-4" strokeWidth={1.75} />
        ) : (
          <Eye className="w-4 h-4" strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
};
