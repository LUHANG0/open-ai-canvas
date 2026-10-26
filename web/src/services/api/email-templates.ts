import { http } from "./request";

export const emailTemplateScenes = [
    { value: "register", label: "注册账号" },
    { value: "login", label: "登录验证" },
    { value: "password_reset", label: "找回密码" },
    { value: "bind", label: "绑定邮箱" },
    { value: "change_email", label: "更换邮箱" },
] as const;

export type EmailTemplateScene = typeof emailTemplateScenes[number]["value"];
export type EmailTemplate = { subject: string; title: string; intro: string; footer: string };
export type EmailTemplates = {
    revision: number;
    templates: Record<EmailTemplateScene, EmailTemplate>;
    defaults: Record<EmailTemplateScene, EmailTemplate>;
    updatedAt?: string;
};
export type EmailTemplatePreview = { subject: string; html: string; text: string };

export function getEmailTemplates() {
    return http.get<{ setting: EmailTemplates }>("/admin/settings/email-templates");
}
export function saveEmailTemplates(input: Pick<EmailTemplates, "revision" | "templates">) {
    return http.patch<{ setting: EmailTemplates }>("/admin/settings/email-templates", input);
}
export function previewEmailTemplate(scene: EmailTemplateScene, template: EmailTemplate) {
    return http.post<{ preview: EmailTemplatePreview }>("/admin/settings/email-templates/preview", { scene, template });
}
