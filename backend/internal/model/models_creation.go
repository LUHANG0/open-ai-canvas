package model

import (
	"time"

	"gorm.io/gorm"
)

// CreationConversation 保存创作页的一条账号级对话快照。
// PayloadJSON 保留前端可演进的消息结构，Revision 负责阻止多设备静默覆盖。
type CreationConversation struct {
	ID          string         `json:"id" gorm:"primaryKey;size:80"`
	UserID      string         `json:"userId" gorm:"index;size:36;index:idx_creation_conversations_user_updated,priority:1"`
	Title       string         `json:"title" gorm:"size:240"`
	PayloadJSON string         `json:"payloadJson" gorm:"type:text"`
	Revision    int64          `json:"revision" gorm:"not null;default:1"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt" gorm:"index:idx_creation_conversations_user_updated,priority:2"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}
