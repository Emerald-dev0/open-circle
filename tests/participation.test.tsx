import { toast } from 'sonner';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Participation from '../src/pages/Participation';
import { TooltipProvider } from '../src/components/ui/tooltip';
import { COMMUNITY_KEY } from '../src/hooks/use-community';
import { api, ApiError } from '../src/lib/api';
import type { ParticipationState } from '../shared/coordination';
import type { CommunityState } from '../shared/community';

vi.mock('../src/lib/api',async original=>({...await original<typeof import('../src/lib/api')>(),api:{community:vi.fn(),participation:vi.fn(),linkWhatsapp:vi.fn(),participate:vi.fn(),signOut:vi.fn()}}));
const community:CommunityState={profile:{id:1,login:'Alice',avatarUrl:'https://avatars.githubusercontent.com/u/1'},signInAvailable:true,tools:[],counts:{},voted:[],toolVotes:{}};
const initial:ParticipationState={activity:{linked:true,login:'Alice',enabled:true,tracking:true,contributions:1,reviewPeers:1,target:4,requiredReviewPeers:2,inactiveDays:3,graceRemainingDays:0,awayUntil:null,awayRequestedDays:null,pendingContributions:0,removalReview:false},projects:[{id:'project_1',title:'Portfolio',url:'https://example.test',owner:'Bob',reviews:0,status:'approved',assignedTo:['Alice'],createdAt:1}],help:[],contributions:[]};
const clients:QueryClient[]=[];
function mount(data=initial){
  vi.mocked(api.participation).mockResolvedValue(data);
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity,refetchOnWindowFocus:false},mutations:{retry:false}}});clients.push(client);
  client.setQueryData(COMMUNITY_KEY,community);
  render(<QueryClientProvider client={client}><TooltipProvider><MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Participation/></MemoryRouter></TooltipProvider></QueryClientProvider>);
  return client;
}
beforeEach(()=>{vi.mocked(api.community).mockReset().mockResolvedValue(community);vi.mocked(api.participation).mockReset();vi.mocked(api.linkWhatsapp).mockReset();vi.mocked(api.participate).mockReset();});
afterEach(()=>clients.splice(0).forEach(client=>client.clear()));

it('directs linking to the bot DM with a short-lived sender verification code',async()=>{
  const user=userEvent.setup();mount({...initial,activity:{...initial.activity,linked:false,login:null}});
  vi.mocked(api.linkWhatsapp).mockResolvedValue({id:'challenge',code:'ABC123',expiresAt:Date.now()+600_000,botChatUrl:'https://wa.me/15550000000?text=%2Flink%20ABC123'});
  const phone=await screen.findByLabelText('Your WhatsApp group number');
  expect(phone.getAttribute('placeholder')).toBe('e.g. +234 803 123 4567');
  await user.type(phone,'0803 123 4567');
  await user.click(screen.getByRole('button',{name:'Get linking code'}));
  expect((await screen.findByRole('alert')).textContent).toContain('country code');
  expect(api.linkWhatsapp).not.toHaveBeenCalled();
  expect((phone as HTMLInputElement).value).toBe('0803 123 4567');
  await user.clear(phone);
  await user.type(phone,'+234 803 123 4567');
  await user.click(screen.getByRole('button',{name:'Get linking code'}));
  await screen.findByText('/link ABC123');expect(api.linkWhatsapp).toHaveBeenCalledWith('+2348031234567',expect.anything());
  expect(screen.getByText('Send this command to the OpenCircle bot in a private WhatsApp chat from that number:')).toBeTruthy();
  expect(screen.getByText(/Open the bot chat and send the prefilled command/).textContent).toContain('/link does not work in the group.');
  const chat=screen.getByRole('link',{name:'Open bot chat'});
  expect(chat.getAttribute('href')).toBe('https://wa.me/15550000000?text=%2Flink%20ABC123');
  expect(chat.getAttribute('target')).toBe('_blank');
  expect(chat.getAttribute('rel')).toBe('noopener noreferrer');
  expect(screen.queryByText('Send this in the WhatsApp group from your number:')).toBeNull();
  await user.click(screen.getByRole('button',{name:'Copy command'}));
  expect(await navigator.clipboard.readText()).toBe('/link ABC123');
  await user.type(screen.getByLabelText('Your WhatsApp group number'),'8');expect(screen.queryByText('/link ABC123')).toBeNull();
  expect(screen.queryByRole('link',{name:'Open bot chat'})).toBeNull();
});

it('focuses feedback, preserves failed submissions, saves useful reviews and requests a break',async()=>{
  const user=userEvent.setup();mount();
  await user.click(await screen.findByRole('button',{name:'Give feedback'}));
  const field=screen.getByLabelText('What you tried and a useful observation or suggestion');
  expect(document.activeElement).toBe(field);
  const feedback='I tested your search form. Please add a clear label and an empty state.';
  await user.type(field,feedback);
  vi.mocked(api.participate).mockRejectedValueOnce(new ApiError(503,'offline','The bot is unavailable.'));
  await user.click(screen.getByRole('button',{name:'Submit feedback'}));await screen.findByText('The bot is unavailable.');expect((field as HTMLTextAreaElement).value).toBe(feedback);
  vi.mocked(api.participate).mockResolvedValue(initial);
  await user.click(screen.getByRole('button',{name:'Submit feedback'}));await waitFor(()=>expect(toast.success).toHaveBeenCalledWith('Your contribution is saved and awaits confirmation.',expect.anything()));
  expect(api.participate).toHaveBeenLastCalledWith({action:'review',projectId:'project_1',text:feedback},expect.anything());
  await user.click(screen.getByRole('button',{name:'Request break'}));await waitFor(()=>expect(toast.success).toHaveBeenCalledWith('Your break request is waiting for admin approval.',expect.anything()));
  expect(api.participate).toHaveBeenLastCalledWith({action:'away',days:7},expect.anything());
});

it('shows owner confirmation and clears private participation after sign-out',async()=>{
  const user=userEvent.setup();
  const client=mount({...initial,contributions:[{id:'feedback_1',by:'Bob',for:'Alice',kind:'review',targetId:'project_2',text:'Useful feedback on your project.',status:'pending',createdAt:1}]});
  vi.mocked(api.participate).mockResolvedValue(initial);
  await user.click(await screen.findByRole('button',{name:'Confirm useful'}));await waitFor(()=>expect(api.participate).toHaveBeenCalledWith({action:'confirm',id:'feedback_1',approve:true},expect.anything()));
  vi.mocked(api.community).mockResolvedValue({...community,profile:null});
  await act(async()=>{client.setQueryData(COMMUNITY_KEY,{...community,profile:null});});
  await screen.findByRole('link',{name:'Sign in with GitHub'});
  expect(client.getQueriesData({queryKey:['participation']}).every(([,data])=>data===undefined)).toBe(true);expect(screen.queryByText('Projects to review')).toBeNull();
});
