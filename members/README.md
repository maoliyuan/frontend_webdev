# 店用会员管理系统

纯前端静态网页（手机优先）+ Supabase 免费版后端，是 frontend_webdev 仓库的子功能。

线上地址：https://maoliyuan.github.io/frontend_webdev/members/

功能：会员增改、充值/核销（操作后即时显示最新次数）、姓名/手机号模糊搜索（手机尾号可搜）、一键导出 JSON / CSV 备份、次数变动流水（误操作可追溯）。

## 首次部署步骤

1. **建 Supabase 项目**（区域选新加坡），SQL Editor 里粘贴执行 `supabase-setup.sql`
   —— 建好 `members`、`transactions` 两张表，开启 RLS，创建原子加减函数 `adjust_remaining`
2. **创建店主账号**：Supabase 后台 → Authentication → Users → Add user
   - 建议顺便关闭 "Confirm email"（就你一个人用，免验证省事）：
     Authentication → Providers → Email → Confirm email 关掉
3. **填配置**：把 `config.js` 里的两行换成你项目的
   - `SUPABASE_URL`：Project Settings → API → Project URL
   - `SUPABASE_ANON_KEY`：同页的 anon public key（`eyJ...` 开头）
4. **推到 GitHub**，仓库 Settings → Pages → Source 选 **GitHub Actions**，push 到 main 即自动部署

> `config.js` 两行留空时是**演示模式**：全部功能可用，数据只存本机浏览器，方便先体验。

## 安全模型

- 登录：Supabase Auth 邮箱密码，只有店主一个账号
- RLS：两张表都开了行级安全，匿名请求一律被数据库拒绝；只有 `authenticated` 角色可读写
- 前端只放 **anon key**——它设计上就是公开的，真正的权限由 RLS 把守
- **service_role key 绝不出现在前端代码里**（它能绕过 RLS，只能放服务器）
- `transactions` 流水表只允许插入和查询、不允许改删，保证账目可信；
  误操作的补救方式是记一笔反向流水（自定义核销/充值 + 备注「冲正」），而不是删历史

## 数据结构

**members**：`name` 姓名 / `phone` 手机号（只存数字）/ `remaining` 剩余次数（≥0）/ `note` 备注

**transactions**：时间、会员、`delta` 变动（正充值负核销）、`remaining_after` 变动后余额、备注

充值/核销都通过数据库函数 `adjust_remaining` 原子完成（改余额 + 写流水一步事务），
防止手机上手抖双击造成错账，函数直接返回最新次数供界面立即显示。

## 备份

菜单 → 导出 JSON（含会员 + 全部流水，一个文件）/ 导出 CSV（会员、流水两个文件，带 BOM，Excel 直接打开不乱码）。建议每周导出一次存微信收藏/网盘。
