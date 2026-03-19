package pim

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gablelbm/gable/internal/ai"
	"github.com/gablelbm/gable/internal/product"
	"github.com/google/uuid"
)

func base64Encode(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

const lumberSystemPrompt = `You are a product content specialist for a lumber and building materials distributor.
You understand wood species (SPF, Douglas Fir, Cedar, Treated Pine, Hardwoods), grading systems (Select Structural, #1, #2, Utility, Appearance),
pressure treatments (ACQ, CA-C, MCA), nominal vs actual dimensions, and building applications (framing, decking, fencing, trim, siding).
You write clear, accurate product descriptions that help contractors, builders, and DIY customers choose the right material.
Always be factual about product attributes. Never fabricate species, grades, or treatment data that isn't provided.`

// Service contains PIM business logic
type Service struct {
	repo            Repository
	productSvc      *product.Service
	textAI          *TextAIClient
	imageAI         *ImageAIClient
	geminiAI        *GeminiImageClient
	geminiKeyStore  *ai.KeyStore
}

// NewService creates a new PIM service
func NewService(repo Repository, productSvc *product.Service) *Service {
	return &Service{
		repo:       repo,
		productSvc: productSvc,
	}
}

// WithTextAI attaches the Anthropic text AI client
func (s *Service) WithTextAI(client *TextAIClient) {
	s.textAI = client
}

// WithImageAI attaches the Stability AI image client
func (s *Service) WithImageAI(client *ImageAIClient) {
	s.imageAI = client
}

// WithGeminiAI attaches the Google Gemini image client
func (s *Service) WithGeminiAI(client *GeminiImageClient) {
	s.geminiAI = client
}

// WithGeminiKeyStore attaches the Gemini key store for dynamic client resolution
func (s *Service) WithGeminiKeyStore(ks *ai.KeyStore) {
	s.geminiKeyStore = ks
}

// GetProductDetail returns the full product + PIM aggregate
func (s *Service) GetProductDetail(ctx context.Context, productID uuid.UUID) (*ProductDetail, error) {
	p, err := s.productSvc.GetProduct(ctx, productID)
	if err != nil {
		return nil, fmt.Errorf("get product: %w", err)
	}

	detail := &ProductDetail{
		ID:              p.ID,
		SKU:             p.SKU,
		Description:     p.Description,
		UOMPrimary:      string(p.UOMPrimary),
		BasePrice:       p.BasePrice,
		Vendor:          p.Vendor,
		UPC:             p.UPC,
		WeightLbs:       p.WeightLbs,
		ReorderPoint:    p.ReorderPoint,
		ReorderQty:      p.ReorderQty,
		TotalQuantity:   p.TotalQuantity,
		TotalAllocated:  p.TotalAllocated,
		AverageUnitCost: p.AverageUnitCost,
		TargetMargin:    p.TargetMargin,
		CommissionRate:  p.CommissionRate,
		CreatedAt:       p.CreatedAt,
		UpdatedAt:       p.UpdatedAt,
	}

	content, _ := s.repo.GetContent(ctx, productID)
	detail.Content = content

	media, _ := s.repo.ListMedia(ctx, productID)
	detail.Media = media
	if detail.Media == nil {
		detail.Media = []PIMMedia{}
	}

	collateral, _ := s.repo.ListCollateral(ctx, productID)
	detail.Collateral = collateral
	if detail.Collateral == nil {
		detail.Collateral = []PIMCollateral{}
	}

	return detail, nil
}

// GetContent returns PIM content for a product
func (s *Service) GetContent(ctx context.Context, productID uuid.UUID) (*PIMContent, error) {
	return s.repo.GetContent(ctx, productID)
}

// UpdateContent allows manual editing of PIM content fields
func (s *Service) UpdateContent(ctx context.Context, productID uuid.UUID, req UpdateContentRequest) (*PIMContent, error) {
	existing, err := s.repo.GetContent(ctx, productID)
	if err != nil {
		return nil, err
	}

	if existing == nil {
		existing = &PIMContent{ProductID: productID, Attributes: make(map[string]string)}
	}

	if req.ShortDescription != nil {
		existing.ShortDescription = *req.ShortDescription
	}
	if req.LongDescription != nil {
		existing.LongDescription = *req.LongDescription
	}
	if req.MarketingCopy != nil {
		existing.MarketingCopy = *req.MarketingCopy
	}
	if req.Attributes != nil {
		existing.Attributes = *req.Attributes
	}
	if req.SEOTitle != nil {
		existing.SEOTitle = *req.SEOTitle
	}
	if req.SEODescription != nil {
		existing.SEODescription = *req.SEODescription
	}
	if req.SEOKeywords != nil {
		existing.SEOKeywords = *req.SEOKeywords
	}
	if req.SEOSlug != nil {
		existing.SEOSlug = *req.SEOSlug
	}

	if err := s.repo.UpsertContent(ctx, existing); err != nil {
		return nil, err
	}

	return existing, nil
}

// GenerateDescriptions uses Claude to generate product descriptions and extract attributes
func (s *Service) GenerateDescriptions(ctx context.Context, productID uuid.UUID, tone, audience string) (*PIMContent, error) {
	if s.textAI == nil {
		return nil, fmt.Errorf("text AI client not configured (set ANTHROPIC_API_KEY)")
	}

	p, err := s.productSvc.GetProduct(ctx, productID)
	if err != nil {
		return nil, fmt.Errorf("get product: %w", err)
	}

	if tone == "" {
		tone = "professional"
	}
	if audience == "" {
		audience = "contractors and builders"
	}

	userPrompt := fmt.Sprintf(`Generate product content for this lumber/building material product:

SKU: %s
Description: %s
UOM: %s
Base Price: $%.2f
Vendor: %s
Weight: %.1f lbs

Tone: %s
Target Audience: %s

Respond with ONLY valid JSON (no markdown fences) in this exact format:
{
  "short_description": "1-2 sentence summary (max 160 chars)",
  "long_description": "3-5 sentence detailed description covering material properties, applications, and benefits",
  "marketing_copy": "Compelling sales-oriented paragraph for catalogs and websites",
  "attributes": {
    "category": "detected product category",
    "species": "wood species if applicable",
    "grade": "lumber grade if applicable",
    "treatment": "treatment type if applicable",
    "dimensions": "nominal dimensions if detectable",
    "application": "primary use case"
  }
}

Only include attribute keys where the value can be reasonably inferred from the product data. Use empty string for unknown attributes rather than guessing.`,
		p.SKU, p.Description, p.UOMPrimary, p.BasePrice,
		stringOrNA(p.Vendor), p.WeightLbs, tone, audience)

	text, model, err := s.textAI.Generate(lumberSystemPrompt, userPrompt, 2048)
	if err != nil {
		return nil, fmt.Errorf("ai generate: %w", err)
	}

	var result GenerateDescriptionsResponse
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, fmt.Errorf("parse AI response: %w (raw: %s)", err, text)
	}

	now := time.Now()
	content := &PIMContent{
		ProductID:        productID,
		ShortDescription: result.ShortDescription,
		LongDescription:  result.LongDescription,
		MarketingCopy:    result.MarketingCopy,
		Attributes:       result.Attributes,
		LastGenModel:     model,
		LastGenPrompt:    userPrompt,
		LastGenAt:        &now,
	}

	// Preserve existing SEO if any
	existing, _ := s.repo.GetContent(ctx, productID)
	if existing != nil {
		content.SEOTitle = existing.SEOTitle
		content.SEODescription = existing.SEODescription
		content.SEOKeywords = existing.SEOKeywords
		content.SEOSlug = existing.SEOSlug
	}
	if content.SEOKeywords == nil {
		content.SEOKeywords = []string{}
	}
	if content.Attributes == nil {
		content.Attributes = make(map[string]string)
	}

	if err := s.repo.UpsertContent(ctx, content); err != nil {
		return nil, fmt.Errorf("save content: %w", err)
	}

	return content, nil
}

// GenerateSEO uses Claude to generate SEO metadata
func (s *Service) GenerateSEO(ctx context.Context, productID uuid.UUID, targetKeywords []string) (*PIMContent, error) {
	if s.textAI == nil {
		return nil, fmt.Errorf("text AI client not configured (set ANTHROPIC_API_KEY)")
	}

	p, err := s.productSvc.GetProduct(ctx, productID)
	if err != nil {
		return nil, fmt.Errorf("get product: %w", err)
	}

	kwStr := "none specified"
	if len(targetKeywords) > 0 {
		kwStr = strings.Join(targetKeywords, ", ")
	}

	userPrompt := fmt.Sprintf(`Generate SEO metadata for this product:

SKU: %s
Description: %s
Vendor: %s
Target Keywords: %s

Respond with ONLY valid JSON (no markdown fences):
{
  "title": "SEO title, max 60 characters, include primary keyword",
  "description": "Meta description, max 160 characters, compelling and keyword-rich",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "slug": "url-friendly-slug-with-keywords"
}`, p.SKU, p.Description, stringOrNA(p.Vendor), kwStr)

	text, model, err := s.textAI.Generate(lumberSystemPrompt, userPrompt, 1024)
	if err != nil {
		return nil, fmt.Errorf("ai generate seo: %w", err)
	}

	var result GenerateSEOResponse
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, fmt.Errorf("parse AI SEO response: %w (raw: %s)", err, text)
	}

	now := time.Now()

	// Get or create content
	content, _ := s.repo.GetContent(ctx, productID)
	if content == nil {
		content = &PIMContent{
			ProductID:  productID,
			Attributes: make(map[string]string),
		}
	}

	content.SEOTitle = result.Title
	content.SEODescription = result.Description
	content.SEOKeywords = result.Keywords
	content.SEOSlug = result.Slug
	content.LastGenModel = model
	content.LastGenPrompt = userPrompt
	content.LastGenAt = &now

	if content.SEOKeywords == nil {
		content.SEOKeywords = []string{}
	}
	if content.Attributes == nil {
		content.Attributes = make(map[string]string)
	}

	if err := s.repo.UpsertContent(ctx, content); err != nil {
		return nil, fmt.Errorf("save seo content: %w", err)
	}

	return content, nil
}

// GenerateImage generates a product image using Gemini (preferred) or Claude SVG fallback
func (s *Service) GenerateImage(ctx context.Context, productID uuid.UUID, style, prompt string) (*PIMMedia, error) {
	// Resolve Gemini client from KeyStore (handles key added/changed after startup)
	if s.geminiKeyStore != nil {
		if key := s.geminiKeyStore.Get(ctx); key != "" {
			if s.geminiAI == nil || s.geminiAI.apiKey != key {
				s.geminiAI = NewGeminiImageClient(key)
			}
		} else {
			s.geminiAI = nil
		}
	}

	if s.geminiAI == nil && s.textAI == nil {
		return nil, fmt.Errorf("no image AI configured — set GEMINI_API_KEY in Admin > AI Settings")
	}

	p, err := s.productSvc.GetProduct(ctx, productID)
	if err != nil {
		return nil, fmt.Errorf("get product: %w", err)
	}

	if prompt == "" {
		prompt = fmt.Sprintf("Professional product photo of %s, lumber building material, clean white background, studio lighting, high resolution, product catalog style", p.Description)
	}

	// Prefer Gemini for real image generation
	if s.geminiAI != nil {
		return s.generateImageGemini(ctx, productID, p, style, prompt)
	}

	// Fallback: Claude SVG illustration
	return s.generateImageSVG(ctx, productID, p, style, prompt)
}

func (s *Service) generateImageGemini(ctx context.Context, productID uuid.UUID, p *product.Product, style, prompt string) (*PIMMedia, error) {
	dataURI, err := s.geminiAI.Generate(prompt, style)
	if err != nil {
		return nil, fmt.Errorf("gemini image generation: %w", err)
	}

	now := time.Now()
	media := &PIMMedia{
		ProductID:   productID,
		MediaType:   "hero",
		URL:         dataURI,
		AltText:     p.Description,
		SortOrder:   0,
		IsPrimary:   false,
		GenModel:    "gemini-2.0-flash",
		GenPrompt:   prompt,
		GenStyle:    style,
		GeneratedAt: &now,
	}

	if err := s.repo.CreateMedia(ctx, media); err != nil {
		return nil, fmt.Errorf("save media: %w", err)
	}

	return media, nil
}

func (s *Service) generateImageSVG(ctx context.Context, productID uuid.UUID, p *product.Product, style, prompt string) (*PIMMedia, error) {
	styleHint := "clean, modern, professional"
	switch style {
	case "photographic":
		styleHint = "photorealistic illustration style with shadows and depth"
	case "digital-art":
		styleHint = "vibrant digital art style with bold colors"
	case "cinematic":
		styleHint = "dramatic cinematic style with moody lighting and contrast"
	case "3d-model":
		styleHint = "3D rendered look with perspective and lighting"
	case "isometric":
		styleHint = "isometric 3D view with clean geometric style"
	}

	userPrompt := fmt.Sprintf(`Generate an SVG product illustration for a lumber/building materials catalog.

Product: %s
SKU: %s
Price: $%.2f
Visual Style: %s
Additional Instructions: %s

Requirements:
- Output ONLY valid SVG markup, nothing else — no markdown fences, no explanation
- SVG must use viewBox="0 0 400 400" with width="400" height="400"
- Create a visually appealing product illustration showing the actual product (not just text)
- Use a subtle gradient background
- Include a small product label area at the bottom with the product name
- Use professional colors appropriate for building materials
- Keep the SVG simple and clean — no external references, no images, only SVG primitives
- Make the illustration recognizable as the actual product`,
		p.Description, p.SKU, p.BasePrice, styleHint, prompt)

	svgSystemPrompt := `You are an SVG illustration generator for a lumber and building materials product catalog.
You create clean, professional SVG product illustrations that visually represent building materials.
Output ONLY raw SVG markup. No markdown, no explanation, no code fences.
Your SVGs must be self-contained with no external dependencies.`

	text, model, err := s.textAI.Generate(svgSystemPrompt, userPrompt, 4096)
	if err != nil {
		return nil, fmt.Errorf("generate SVG: %w", err)
	}

	trimmed := strings.TrimSpace(text)
	if !strings.HasPrefix(trimmed, "<svg") && !strings.HasPrefix(trimmed, "<?xml") {
		return nil, fmt.Errorf("AI did not return valid SVG (starts with: %.50s...)", trimmed)
	}

	dataURI := "data:image/svg+xml;base64," + base64Encode([]byte(trimmed))

	now := time.Now()
	media := &PIMMedia{
		ProductID:   productID,
		MediaType:   "hero",
		URL:         dataURI,
		AltText:     p.Description,
		SortOrder:   0,
		IsPrimary:   false,
		GenModel:    model,
		GenPrompt:   userPrompt,
		GenStyle:    style,
		GeneratedAt: &now,
	}

	if err := s.repo.CreateMedia(ctx, media); err != nil {
		return nil, fmt.Errorf("save media: %w", err)
	}

	return media, nil
}

// GenerateCollateral uses Claude to generate marketing collateral
func (s *Service) GenerateCollateral(ctx context.Context, productID uuid.UUID, collateralType, tone, audience string) (*PIMCollateral, error) {
	if s.textAI == nil {
		return nil, fmt.Errorf("text AI client not configured (set ANTHROPIC_API_KEY)")
	}

	p, err := s.productSvc.GetProduct(ctx, productID)
	if err != nil {
		return nil, fmt.Errorf("get product: %w", err)
	}

	if tone == "" {
		tone = "professional"
	}
	if audience == "" {
		audience = "contractors and builders"
	}

	var formatInstructions string
	switch collateralType {
	case "sell_sheet":
		formatInstructions = `Generate a sell sheet with these sections:
- Headline (attention-grabbing, 8 words max)
- Key Benefits (3-5 bullet points)
- Technical Specifications
- Ideal Applications
- Call to Action`
	case "facebook":
		formatInstructions = `Generate a Facebook post (max 300 chars) with:
- Engaging hook
- Product highlight
- Call to action
- 2-3 relevant hashtags`
	case "instagram":
		formatInstructions = `Generate an Instagram caption (max 200 chars) with:
- Attention-grabbing first line
- Product benefit
- 5-8 relevant hashtags`
	case "linkedin":
		formatInstructions = `Generate a LinkedIn post (max 500 chars) with:
- Professional industry insight opening
- Product value proposition
- Call to action for B2B buyers`
	case "email_blast":
		formatInstructions = `Generate an email with:
- Subject Line (max 50 chars)
- Preview Text (max 90 chars)
- Email Body (3-4 paragraphs: hook, benefits, specs, CTA)`
	default:
		formatInstructions = "Generate compelling marketing content for this product."
	}

	userPrompt := fmt.Sprintf(`Create %s marketing collateral for:

SKU: %s
Description: %s
Price: $%.2f
Vendor: %s

Tone: %s
Audience: %s

%s

Respond with ONLY valid JSON (no markdown fences):
{
  "title": "Brief title for this collateral piece",
  "content": "The full content (use \\n for line breaks)"
}`, collateralType, p.SKU, p.Description, p.BasePrice, stringOrNA(p.Vendor), tone, audience, formatInstructions)

	text, model, err := s.textAI.Generate(lumberSystemPrompt, userPrompt, 2048)
	if err != nil {
		return nil, fmt.Errorf("ai generate collateral: %w", err)
	}

	var result struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, fmt.Errorf("parse AI collateral response: %w (raw: %s)", err, text)
	}

	now := time.Now()
	collateral := &PIMCollateral{
		ProductID:      productID,
		CollateralType: collateralType,
		Title:          result.Title,
		Content:        result.Content,
		Tone:           tone,
		Audience:       audience,
		GenModel:       model,
		GenPrompt:      userPrompt,
		GeneratedAt:    &now,
	}

	if err := s.repo.CreateCollateral(ctx, collateral); err != nil {
		return nil, fmt.Errorf("save collateral: %w", err)
	}

	return collateral, nil
}

// ListMedia returns all media for a product
func (s *Service) ListMedia(ctx context.Context, productID uuid.UUID) ([]PIMMedia, error) {
	return s.repo.ListMedia(ctx, productID)
}

// DeleteMedia removes a media item
func (s *Service) DeleteMedia(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteMedia(ctx, id)
}

// SetPrimaryMedia sets a media item as the primary image
func (s *Service) SetPrimaryMedia(ctx context.Context, productID, mediaID uuid.UUID) error {
	return s.repo.SetPrimaryMedia(ctx, productID, mediaID)
}

// ListCollateral returns all collateral for a product
func (s *Service) ListCollateral(ctx context.Context, productID uuid.UUID) ([]PIMCollateral, error) {
	return s.repo.ListCollateral(ctx, productID)
}

// DeleteCollateral removes a collateral item
func (s *Service) DeleteCollateral(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteCollateral(ctx, id)
}

func stringOrNA(s *string) string {
	if s == nil || *s == "" {
		return "N/A"
	}
	return *s
}
