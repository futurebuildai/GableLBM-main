package millwork

import "github.com/gablelbm/gable/pkg/apps"

// App is the millwork app manifest. The app owns two backend modules —
// millwork (options/work data) and configurator (rules, validation,
// build-sku) — registered together under this key in cmd/server/main.go.
var App = apps.Manifest{
	Key:      "millwork",
	Name:     "Millwork",
	Summary:  "Door and window configurator: option catalogs, rule validation, and SKU building.",
	Category: "Sales",
	Core:     false,
}
