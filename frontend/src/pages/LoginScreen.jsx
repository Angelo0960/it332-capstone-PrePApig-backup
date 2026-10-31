import { useState } from 'react';
import { CheckCircle2, Lock, User } from 'lucide-react';
import { api } from '../api.js';
import pigImage from '../assets/Gemini_Generated_Image_jx97tijx97tijx97.webp';
import backgroundImage from '../assets/Gemini_Generated_Image_o4e5bbo4e5bbo4e5.webp';

const stats = [
  { value: '99%', label: 'Feed Efficiency' },
  { value: '4×', label: 'Vaccines Tracked' },
  { value: '₱0', label: 'Hidden Fees' },
];

export function LoginScreen({ onLogin }) {
  const [farmerId, setFarmerId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!farmerId || !password) {
      setError('Enter both your Farmer ID and Access Key.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.login(farmerId, password);
      localStorage.setItem('token', data.token);
      onLogin();
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const updateFarmerId = (value) => { setFarmerId(value); setError(''); };
  const updatePassword = (value) => { setPassword(value); setError(''); };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden text-white">
      <img src={backgroundImage} alt="Farm Background" className="fixed inset-0 h-[100dvh] w-full object-cover object-center" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#0b6072]/55 via-[#26796f]/45 to-[#4b7757]/50" />
      <div className="absolute inset-0 bg-[#173f44]/10 backdrop-blur-[1px]" />

      <div className="relative z-10 mx-auto hidden min-h-[100dvh] w-full grid-cols-[1.08fr_0.92fr] lg:grid">
        <section className="flex flex-col justify-between px-[8.6vw] py-14 xl:py-20">
          <div>
            <h1 className="font-['Erica_One'] text-[54px] leading-none tracking-[-0.035em] drop-shadow-sm xl:text-[60px]"><span className="text-[#67C6E3]">PrepA</span><span className="text-[#FF78A4]">Pig</span></h1>
            <p className="mt-5 max-w-[470px] text-lg font-bold leading-7 text-white drop-shadow-sm">The all-in-one pig farm management system<br />for modern Filipino farmers.</p>
          </div>
          <div className="-mt-2">
            <h2 className="font-['Erica_One'] text-[48px] leading-[1.38] tracking-[0.01em] text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.08)] xl:text-[54px]">Feed Smart.<br /><span className="text-[#FF78A4]">Grow Fast.</span><br />Profit More.</h2>
            <p className="mt-6 max-w-[490px] text-base leading-7 text-white/85">Everything your pig farm needs — tracked,<br />scheduled, and optimized in one place.</p>
          </div>
          <div className="flex gap-14">{stats.map(({ value, label }) => <div key={label}><p className="font-['Erica_One'] text-4xl leading-none text-white drop-shadow-sm">{value}</p><p className="mt-3 text-sm text-white/75">{label}</p></div>)}</div>
        </section>

        <section className="flex items-center justify-center px-8 py-12 xl:px-12">
          <div className="relative mt-10 w-full max-w-[400px]">
            <img src={pigImage} alt="Smiling PrepAPig mascot" className="pointer-events-none absolute left-1/2 top-0 z-0 h-[300px] w-[300px] -translate-x-1/2 -translate-y-[55%] object-contain mix-blend-multiply drop-shadow-[0_16px_22px_rgba(20,50,48,0.26)]" />
            <div className="relative z-10 rounded-[36px] border border-white/45 bg-white/20 px-8 pb-7 pt-9 shadow-[0_28px_70px_rgba(13,48,43,0.18)] backdrop-blur-2xl">
              <div className="text-center"><div className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-white/80"><CheckCircle2 className="size-5 text-[#4DE2B6]" />Farm Management Portal</div><h2 className="font-['Erica_One'] text-[28px] text-white drop-shadow-md">Welcome Back</h2><p className="mt-2 text-sm text-white/65">Sign in to your farm dashboard</p></div>
              <LoginForm farmerId={farmerId} password={password} error={error} loading={loading} onFarmerIdChange={updateFarmerId} onPasswordChange={updatePassword} onSubmit={handleLogin} />
              <p className="mt-5 text-center text-xs text-white/60">Demo: enter any Farmer ID &amp; Access Key to continue</p><p className="mt-6 text-center text-xs text-white/45">PrepAPig © 2025 · Pig Farm Intelligence Platform</p>
            </div>
          </div>
        </section>
      </div>

      <div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5 py-10 lg:hidden"><div className="w-full max-w-sm"><h1 className="mb-14 text-center font-['Erica_One'] text-5xl leading-none drop-shadow-sm"><span className="text-[#67C6E3]">PrepA</span><span className="text-[#FF78A4]">Pig</span></h1><div className="relative"><img src={pigImage} alt="Smiling PrepAPig mascot" className="pointer-events-none absolute left-1/2 top-0 z-0 h-52 w-52 -translate-x-1/2 -translate-y-[56%] object-contain mix-blend-multiply drop-shadow-xl" /><div className="relative z-10 rounded-[38px] border border-white/45 bg-white/20 px-6 pb-7 pt-16 shadow-[0_24px_60px_rgba(13,48,43,0.2)] backdrop-blur-2xl"><div className="text-center"><div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-white/80"><CheckCircle2 className="size-4 text-[#4DE2B6]" />Farm Management Portal</div><h2 className="font-['Erica_One'] text-3xl">Welcome Back</h2><p className="mt-1 text-sm text-white/65">Sign in to your farm dashboard</p></div><LoginForm farmerId={farmerId} password={password} error={error} loading={loading} onFarmerIdChange={updateFarmerId} onPasswordChange={updatePassword} onSubmit={handleLogin} /><p className="mt-5 text-center text-[11px] text-white/55">Demo: enter any Farmer ID &amp; Access Key</p></div></div></div></div>
    </div>
  );
}

function LoginForm({ farmerId, password, error, loading, onFarmerIdChange, onPasswordChange, onSubmit }) {
  return <div className="mt-8 space-y-5">
    <div className="relative"><User className="absolute left-5 top-1/2 size-6 -translate-y-1/2 text-[#FF2F72]" /><input id="farmerId" value={farmerId} onChange={(event) => onFarmerIdChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onSubmit()} placeholder="Farmer ID" autoComplete="username" className="w-full rounded-[22px] border border-white/45 bg-white/10 py-4 pl-14 pr-5 text-base text-white outline-none backdrop-blur-lg placeholder:text-white/40 focus:border-white/70 focus:ring-2 focus:ring-[#FF2F72]/25" /></div>
    <div className="relative"><Lock className="absolute left-5 top-1/2 size-6 -translate-y-1/2 text-[#FF2F72]" /><input id="accessKey" type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onSubmit()} placeholder="Access Key ••••••" autoComplete="current-password" className="w-full rounded-[22px] border border-white/45 bg-white/10 py-4 pl-14 pr-5 text-base text-white outline-none backdrop-blur-lg placeholder:text-white/40 focus:border-white/70 focus:ring-2 focus:ring-[#FF2F72]/25" /></div>
    {error && <p className="text-center text-xs font-semibold text-[#FFD1DF]">{error}</p>}
    <button onClick={onSubmit} disabled={loading} className="w-full rounded-[22px] bg-[#F5125D] py-4 text-lg font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_10px_0_#AD1457] transition hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_5px_0_#AD1457] disabled:cursor-wait disabled:opacity-70">{loading ? 'Signing In…' : 'Start Tracking'}</button>
  </div>;
}

export default LoginScreen;
