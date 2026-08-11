import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { MessageSquare } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { AuthUser } from '@/types';

function mapSupabaseUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email!,
    username: user.user_metadata?.username || user.user_metadata?.full_name || user.email!.split('@')[0],
    avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture,
  };
}

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, loginAsGuest } = useAuthStore();
  const navigate = useNavigate();

  const handleGuestLogin = () => {
    loginAsGuest();
    toast.success('게스트 모드로 시작합니다');
    navigate('/');
  };

  const handleSendOtp = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setOtpSent(true);
      toast.success('인증 코드가 이메일로 전송되었습니다');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });
      if (error) throw error;

      const username = email.split('@')[0];
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { username },
      });
      if (updateError) throw updateError;

      login(mapSupabaseUser(data.user));
      navigate('/');
    } catch (error: any) {
      toast.error(error.message);
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      login(mapSupabaseUser(data.user));
      navigate('/');
    } catch (error: any) {
      toast.error(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">
            {isLogin ? '로그인' : '회원가입'}
          </CardTitle>
          <CardDescription className="text-center">
            ChatGPT 스타일 AI 채팅을 시작하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 게스트 로그인 버튼 */}
          <Button
            onClick={handleGuestLogin}
            variant="outline"
            className="w-full border-2 border-primary/50 hover:bg-primary/10"
            size="lg"
          >
            게스트로 바로 시작하기
          </Button>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">또는</span>
            </div>
          </div>

          <div className="space-y-2">
            <Input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || otpSent}
            />
          </div>

          {isLogin ? (
            <>
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button onClick={handleLogin} className="w-full" disabled={loading}>
                {loading ? '로그인 중...' : '로그인'}
              </Button>
            </>
          ) : (
            <>
              {!otpSent ? (
                <Button onClick={handleSendOtp} className="w-full" disabled={loading}>
                  {loading ? '전송 중...' : '인증 코드 받기'}
                </Button>
              ) : (
                <>
                  <div className="space-y-2">
                    <Input
                      placeholder="인증 코드 (4자리)"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      disabled={loading}
                      maxLength={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Input
                      type="password"
                      placeholder="비밀번호 설정"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <Button onClick={handleRegister} className="w-full" disabled={loading}>
                    {loading ? '가입 중...' : '회원가입 완료'}
                  </Button>
                </>
              )}
            </>
          )}

          <div className="text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setOtpSent(false);
                setOtp('');
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              disabled={loading}
            >
              {isLogin ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
