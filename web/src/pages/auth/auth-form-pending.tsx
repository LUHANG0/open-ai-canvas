import { AppLoading } from "@/components/ui/app-loading";

export function AuthFormPending({ fields = 2, message = "正在准备表单" }: { fields?: number; message?: string }) {
    return <div style={{ minHeight: fields * 72 + 48 }}><AppLoading compact label={message} className="auth-form-loading" /></div>;
}
