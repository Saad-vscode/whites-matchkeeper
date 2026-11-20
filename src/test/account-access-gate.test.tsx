import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc}}));
import { AccountAccessGate } from '@/components/account-access-gate';
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AccountAccessGate userId="account"><div>Existing scorer interface</div></AccountAccessGate></QueryClientProvider>)}
beforeEach(()=>{sessionStorage.clear();vi.clearAllMocks()});afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it('renders the unchanged user interface after positive backend verification',async()=>{mocks.rpc.mockResolvedValue({data:true,error:null});mount();expect(await screen.findByText('Existing scorer interface')).toBeInTheDocument();expect(screen.queryByText('Account restricted')).toBeNull()});
it('hides protected controls for an existing blocked session without clearing saved scoring data',async()=>{const saved=new Map([['test-scoring-queue','saved']]);vi.stubGlobal('localStorage',{getItem:(key:string)=>saved.get(key),setItem:(key:string,value:string)=>saved.set(key,value),removeItem:(key:string)=>saved.delete(key),clear:()=>saved.clear()});mocks.rpc.mockResolvedValue({data:false,error:null});mount();await screen.findByText('Account restricted');expect(screen.queryByText('Existing scorer interface')).toBeNull();expect(localStorage.getItem('test-scoring-queue')).toBe('saved');localStorage.removeItem('test-scoring-queue')});
it('fails closed on permission-check errors',async()=>{mocks.rpc.mockResolvedValue({data:null,error:new Error('Connection failed')});mount();await screen.findByRole('alert');expect(screen.queryByText('Existing scorer interface')).toBeNull();expect(screen.getByRole('button',{name:'Retry'})).toBeInTheDocument()});
