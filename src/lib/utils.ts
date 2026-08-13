import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind 충돌을 정리하면서 조건부 클래스 값을 안전하게 결합합니다. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
