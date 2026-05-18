package x12

import (
	"fmt"
	"strings"
	"time"

	"github.com/gablelbm/gable/internal/domain"
)

// Generate850 creates an X12 850 Purchase Order string
// This is a simplified generator for demonstration/MVP
func Generate850(po domain.POData, profile domain.EDIProfile) (string, error) {
	var sb strings.Builder

	now := time.Now()
	dateStr := now.Format("060102") // YYMMDD
	timeStr := now.Format("1504")   // HHMM

	// ISA Header
	// ISA*00*          *00*          *ZZ*SENDERID       *ZZ*RECEIVERID     *260206*1200*U*00401*000000001*0*P*>~
	sb.WriteString(fmt.Sprintf(
		"ISA*00*          *00*          *ZZ*%-15s*ZZ*%-15s*%s*%s*U*00401*%09d*0*P*>~\n",
		profile.ISASenderID, profile.ISAReceiverID, dateStr, timeStr, 1,
	))

	// GS Header
	// GS*PO*SENDERID*RECEIVERID*20260206*1200*1*X*004010~
	sb.WriteString(fmt.Sprintf(
		"GS*PO*%s*%s*%s*%s*%d*X*004010~\n",
		profile.GSSenderID, profile.GSReceiverID, now.Format("20060102"), timeStr, 1,
	))

	// ST Transaction Set Header
	// ST*850*0001~
	sb.WriteString("ST*850*0001~\n")

	// BEG Beginning Segment
	// BEG*00*NE*PO12345**20260206~
	sb.WriteString(fmt.Sprintf(
		"BEG*00*NE*%s**%s~\n",
		po.ID.String(), now.Format("20060102"),
	))

	// Items (PO1 Loop)
	// PO1*1*100*EA*12.50**VN*SKU123*BP*YOURSKU~
	// Note: We need access to lines.
	for i, line := range po.Lines {
		sb.WriteString(fmt.Sprintf(
			"PO1*%d*%.0f*EA*%.2f**VN*UNKNOWN*BP*UNKNOWN~\n", // Simplified
			i+1, line.Quantity, line.Cost,
		))
	}

	// CTT Transaction Totals
	// CTT*1*100~
	sb.WriteString(fmt.Sprintf("CTT*%d~\n", len(po.Lines)))

	// SE Transaction Set Trailer
	// SE*LINECOUNT*0001~
	// Note: Line count calculation is skipped for brevity in this stub, using placeholder
	sb.WriteString("SE*10*0001~\n")

	// GE Functional Group Trailer
	// GE*1*1~
	sb.WriteString("GE*1*1~\n")

	// IEA Interchange Control Trailer
	// IEA*1*000000001~
	sb.WriteString(fmt.Sprintf("IEA*1*%09d~\n", 1))

	return sb.String(), nil
}
