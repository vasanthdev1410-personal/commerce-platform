'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import type { Cart } from '@/types/cart';
import type { PricingMode } from '@/types/pricing';
interface CartContextValue { cart:Cart|null; isLoading:boolean; refresh:()=>Promise<void>; add:(variantId:string,quantity:number)=>Promise<void>; update:(id:string,quantity:number)=>Promise<void>; remove:(id:string)=>Promise<void>; clear:()=>Promise<void>; setMode:(mode:PricingMode)=>Promise<void> }
const CartContext = createContext<CartContextValue|null>(null);
export function CartProvider({ children }: { children:ReactNode }) { const { isAuthenticated,isLoading:authLoading,authenticatedRequest } = useAuth(); const [cart,setCart] = useState<Cart|null>(null); const [isLoading,setLoading] = useState(false);
  const refresh = useCallback(async()=>{ if(!isAuthenticated){setCart(null);return;} setLoading(true); try{setCart(await authenticatedRequest<Cart>('/cart'));}finally{setLoading(false)} },[authenticatedRequest,isAuthenticated]);
  useEffect(()=>{if(!authLoading) queueMicrotask(()=>void refresh());},[authLoading,refresh]);
  const mutate=useCallback(async(path:string,init:RequestInit)=>{setLoading(true);try{const result=await authenticatedRequest<Cart>(path,init);setCart(result);}finally{setLoading(false)}},[authenticatedRequest]);
  const value=useMemo<CartContextValue>(()=>({cart,isLoading,refresh,add:(variantId,quantity)=>mutate('/cart/items',{method:'POST',body:JSON.stringify({variantId,quantity})}),update:(id,quantity)=>mutate(`/cart/items/${id}`,{method:'PATCH',body:JSON.stringify({quantity})}),remove:async(id)=>{await authenticatedRequest(`/cart/items/${id}`,{method:'DELETE'});await refresh();},clear:async()=>{await authenticatedRequest('/cart',{method:'DELETE'});await refresh();},setMode:(pricingMode)=>mutate('/cart/pricing-mode',{method:'PATCH',body:JSON.stringify({pricingMode})})}),[authenticatedRequest,cart,isLoading,mutate,refresh]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>; }
export function useCart(){const value=useContext(CartContext);if(!value)throw new Error('useCart must be used within CartProvider');return value;}
