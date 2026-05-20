"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft, Mail, CheckCircle2, Eye, EyeOff, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@client/components/ui/card";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Logo } from "@client/components/ui/logo";

// ─── Step 1: Request reset (no token in URL) ─────────────────────────────────

function RequestResetForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always show success (to avoid user enumeration)
      setSent(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Card className="shadow-xl border-0">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 mx-auto">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Email enviado!</h2>
            <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
              Se o email <strong>{email}</strong> estiver cadastrado, você receberá um link de redefinição em breve.
              Verifique também a caixa de spam.
            </p>
          </div>
          <p className="text-xs text-gray-400">O link expira em 1 hora.</p>
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao login
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-xl border-0">
      <CardHeader className="text-center pb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 mx-auto mb-3">
          <Mail className="h-6 w-6 text-blue-600" />
        </div>
        <CardTitle className="text-xl">Esqueceu sua senha?</CardTitle>
        <CardDescription>
          Digite seu email e enviaremos um link para redefinir sua senha.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email da conta</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Enviando...</>
            ) : (
              "Enviar link de redefinição"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao login
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 2: Set new password (token present in URL) ─────────────────────────

function NewPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const passwordsMatch = confirm === "" || password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) { setError("A senha deve ter pelo menos 6 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não coincidem."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao redefinir senha");
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao redefinir senha");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Card className="shadow-xl border-0">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 mx-auto">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Senha redefinida!</h2>
            <p className="text-sm text-gray-500">Redirecionando para o login...</p>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-blue-500 mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-xl border-0">
      <CardHeader className="text-center pb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 mx-auto mb-3">
          <KeyRound className="h-6 w-6 text-blue-600" />
        </div>
        <CardTitle className="text-xl">Nova senha</CardTitle>
        <CardDescription>Escolha uma senha forte para sua conta.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-10"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar nova senha</Label>
            <Input
              id="confirm"
              type={showPw ? "text" : "password"}
              placeholder="Repita a senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className={!passwordsMatch ? "border-red-300" : ""}
            />
            {!passwordsMatch && (
              <p className="text-xs text-red-500">As senhas não coincidem.</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="gradient"
            size="lg"
            className="w-full"
            disabled={loading || !passwordsMatch}
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</> : "Salvar nova senha"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo size="md" />
        </div>
        {token ? <NewPasswordForm token={token} /> : <RequestResetForm />}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
