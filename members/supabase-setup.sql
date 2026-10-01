-- ============================================================
-- 会员管理系统 · Supabase 初始化脚本
-- 用法：Supabase 后台 → SQL Editor → New query → 整段粘贴 → Run
-- 可重复执行（IF EXISTS / drop policy if exists）
-- ============================================================

-- ---------- 1. 会员表 ----------
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                    -- 姓名
  phone       text not null default '',         -- 手机号（只存数字，便于尾号搜索）
  remaining   integer not null default 0,       -- 剩余次数
  note        text not null default '',         -- 备注
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint members_remaining_nonneg check (remaining >= 0)
);

-- ---------- 2. 次数变动记录表（流水，误操作可追溯） ----------
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.members(id) on delete cascade,
  member_name     text not null default '',     -- 冗余存姓名：会员改名/删除后记录仍可读
  delta           integer not null,             -- 正=充值，负=核销
  remaining_after integer not null,             -- 操作后的剩余次数
  note            text not null default '',
  created_at      timestamptz not null default now()
);

create index if not exists idx_members_phone    on public.members (phone);
create index if not exists idx_tx_member_time   on public.transactions (member_id, created_at desc);

-- ---------- 3. RLS 行级安全：匿名一律拒绝，仅登录用户可读写 ----------
alter table public.members      enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "登录用户可读会员"   on public.members;
drop policy if exists "登录用户可建会员"   on public.members;
drop policy if exists "登录用户可改会员"   on public.members;
drop policy if exists "登录用户可删会员"   on public.members;
create policy "登录用户可读会员" on public.members for select to authenticated using (true);
create policy "登录用户可建会员" on public.members for insert to authenticated with check (true);
create policy "登录用户可改会员" on public.members for update to authenticated using (true) with check (true);
create policy "登录用户可删会员" on public.members for delete to authenticated using (true);

-- 记录表只允许 读 + 插入：不允许改和删，保证流水可信、可追溯
-- （误操作的补救方式是再记一笔反向流水，而不是删历史）
drop policy if exists "登录用户可读记录"   on public.transactions;
drop policy if exists "登录用户可插记录"   on public.transactions;
create policy "登录用户可读记录" on public.transactions for select to authenticated using (true);
create policy "登录用户可插记录" on public.transactions for insert to authenticated with check (true);

-- ---------- 4. 原子地加减次数（防手抖双击、防并发错账） ----------
-- 前端只调用这个函数做充值/核销，一步完成：改余额 + 写流水，并返回最新次数
create or replace function public.adjust_remaining(
  p_member_id uuid,
  p_delta     integer,
  p_note      text default ''
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_new    integer;
begin
  select * into v_member from public.members where id = p_member_id for update;
  if not found then
    raise exception '会员不存在';
  end if;
  v_new := v_member.remaining + p_delta;
  if v_new < 0 then
    raise exception '剩余次数不足（当前 % 次）', v_member.remaining;
  end if;
  update public.members
     set remaining = v_new, updated_at = now()
   where id = p_member_id;
  insert into public.transactions (member_id, member_name, delta, remaining_after, note)
  values (p_member_id, v_member.name, p_delta, v_new, p_note);
  return v_new;
end $$;

-- 只有登录用户能调用，匿名不行
revoke all on function public.adjust_remaining(uuid, integer, text) from public, anon;
grant execute on function public.adjust_remaining(uuid, integer, text) to authenticated;

-- ---------- 5. members.updated_at 自动维护 ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists members_touch on public.members;
create trigger members_touch before update on public.members
for each row execute function public.touch_updated_at();
