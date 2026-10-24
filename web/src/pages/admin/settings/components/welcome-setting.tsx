import { Link } from "react-router";
export function WelcomeSetting() { return <div><p>官网始终位于 /，登录后也不会自动跳过。旧欢迎页开关不再控制根入口。</p><Link to="/admin/settings/brand-site">编辑官网、预览与手动发布</Link></div>; }
