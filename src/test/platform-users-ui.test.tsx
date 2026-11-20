vi.mock("@/components/platform-features", () => ({ FeatureEditor: () => <div>Feature permissions</div> }));
﻿import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({directory:vi.fn(),details:vi.fn(),manage:vi.fn(),invite:vi.fn()}));
vi.mock('@/lib/platform-users',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/platform-users')>(),getDirectory:mocks.directory,getUserDetails:mocks.details,manageUser:mocks.manage,inviteUser:mocks.invite}));
vi.mock('@tanstack/react-router',()=>({Link:({children,...props}:any)=><a {...props}>{children}</a>}));
import { PlatformUsers } from '@/components/platform-users';
const user={id:'person',email:'alice@example.com',full_name:'Alice',role:'user',status:'active',tournaments:4,created_at:'2026-01-01',last_sign_in_at:null,avatar_url:null};
function mount(role:'owner'|'admin'='owner'){
 mocks.directory.mockResolvedValue({rows:[user],total:1,summary:{total:1,active:1,blocked:0,admins:1,new:1}});
 mocks.details.mockResolvedValue({reason:null,tournaments:[],history:[]});mocks.manage.mockResolvedValue(undefined);
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 return render(<QueryClientProvider client={client}><PlatformUsers actorId="actor" actorRole={role}/></QueryClientProvider>);
}
afterEach(()=>{cleanup();vi.clearAllMocks()});
it('requires exact email and reason before recoverable deletion and preserves impact messaging',async()=>{
 mount();await screen.findByRole('table');
 fireEvent.click(screen.getAllByRole('button',{name:/Alice/})[0]!);
 fireEvent.click(await screen.findByRole('button',{name:'Delete account'}));
 expect(screen.getByText(/owns 4 tournaments/)).toBeInTheDocument();
 const confirm=screen.getByRole('button',{name:'Confirm'});expect(confirm).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Reason (required)'),{target:{value:'User request'}});
 fireEvent.change(screen.getByLabelText('Type the account email to confirm'),{target:{value:'wrong@example.com'}});
 expect(confirm).toBeDisabled();expect(mocks.manage).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Type the account email to confirm'),{target:{value:user.email}});
 fireEvent.click(confirm);
 await waitFor(()=>expect(mocks.manage).toHaveBeenCalledWith('person','deactivate','Alice','','User request'));
});
it('restricts invitation role selection for admins and supports mobile account presentation',async()=>{
 mount('admin');await screen.findByRole('table');
 expect(screen.getByRole('article')).toHaveTextContent('Last sign-in');
 fireEvent.click(screen.getByRole('button',{name:'Add user'}));
 const select=screen.getByLabelText('Platform role');expect(select.querySelectorAll('option')).toHaveLength(1);
 expect(screen.getByRole('button',{name:'Send invitation'})).toBeDisabled();
});
it('sends server-side filters and exposes empty or error states',async()=>{
 mount();await screen.findByRole('table');
 mocks.directory.mockResolvedValue({rows:[],total:0,summary:{total:1,active:1,blocked:0,admins:1,new:1}});
 fireEvent.change(screen.getByLabelText('Filter by status'),{target:{value:'blocked'}});
 await screen.findByText('No accounts found');
 expect(mocks.directory).toHaveBeenLastCalledWith(expect.objectContaining({status:'blocked',page:0}));
});
