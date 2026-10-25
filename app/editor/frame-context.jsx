'use client';
import { createContext, useContext } from 'react';
export const FrameEditingContext = createContext(false);
export function useFrameEditing() { return useContext(FrameEditingContext); }
// GRE-2394: true in Edit copy. Words change; colour and layout do not.
export const FrameCopyContext = createContext(false);
export function useFrameCopy() { return useContext(FrameCopyContext); }
