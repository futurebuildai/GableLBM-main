package governance

import (
	"context"
	"fmt"
)

type AIProvider interface {
	GenerateRFC(ctx context.Context, title, problem, solution string) (string, error)
}

type TemplateAIProvider struct{}

func NewTemplateAIProvider() *TemplateAIProvider {
	return &TemplateAIProvider{}
}

func (p *TemplateAIProvider) GenerateRFC(ctx context.Context, title, problem, solution string) (string, error) {
	// In the future, this would call OpenAI/Anthropic
	template := `# RFC: %s

## Status: Draft
## Author: AI Assistant

### 1. Problem Statement
%s

### 2. Proposed Solution
%s

### 3. Technical Implementation
*To be filled by Engineering*

### 4. Drawbacks & Alternatives
*To be filled by Engineering*
`
	return fmt.Sprintf(template, title, problem, solution), nil
}
