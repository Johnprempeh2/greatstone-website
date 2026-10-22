'use client';
import { createContext, useContext } from 'react';
export const FrameEditingContext = createContext(false);
export function useFrameEditing() { return useContext(FrameEditingContext); }
