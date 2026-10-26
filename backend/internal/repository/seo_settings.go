package repository

import (
	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

// SEO credential/configuration updates and their redacted audit event commit as
// one operation. The existing setting CAS also protects SQLite and PostgreSQL.
func (r *Repository) CompareAndSwapSEOSettings(next, previous *model.SystemSetting, event *model.AdminAuditEvent) (bool, error) {
	swapped := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		nested := *r
		nested.db = tx
		var err error
		swapped, err = nested.CompareAndSwapSystemSetting(next, previous)
		if err != nil || !swapped {
			return err
		}
		return nested.AppendAdminAudit(event)
	})
	return swapped && err == nil, err
}
