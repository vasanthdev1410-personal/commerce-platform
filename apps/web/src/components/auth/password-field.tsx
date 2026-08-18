'use client';

import { useState, type InputHTMLAttributes } from 'react';

interface PasswordFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function PasswordField({ label, id, ...props }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div>
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          className="form-input pr-20"
          id={id}
          type={isVisible ? 'text' : 'password'}
        />
        <button
          aria-label={`${isVisible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-blue-700 hover:text-blue-900 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-blue-700"
          onClick={() => setIsVisible((current) => !current)}
          type="button"
        >
          {isVisible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}
