package governance

import "github.com/gablelbm/gable/pkg/apps"

// App is the governance app manifest: AI-assisted RFC drafting and tracking
// for the federated contribution model.
var App = apps.Manifest{
	Key:      "governance",
	Name:     "Governance (RFCs)",
	Summary:  "AI-assisted RFC drafting, review, and status tracking for platform governance.",
	Category: "Platform",
	Core:     false,
}
