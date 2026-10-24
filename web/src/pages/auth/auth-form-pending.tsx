export function AuthFormPending({ fields = 2, message = "正在准备表单" }: { fields?: number; message?: string }) {
    return <div className="auth-form-pending" role="status" aria-busy="true">
        <div aria-hidden="true">
            {Array.from({ length: fields }, (_, index) => <div className="auth-pending-field" key={index}>
                <span className="auth-pending-label" /><span className="auth-pending-input" />
            </div>)}
        </div>
        <span className="auth-pending-status">{message}</span>
    </div>;
}
