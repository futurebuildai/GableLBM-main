import { useState } from 'react';
import { ChevronRight, ChevronDown, FolderTree } from 'lucide-react';
import type { ProductCategory } from '../../../types/category-pricing';
import { cn } from '../../../lib/utils';

interface CategoryTreeProps {
  categories: ProductCategory[];
  selectedId: string | null;
  onSelect: (category: ProductCategory) => void;
}

const CategoryNode = ({
  category,
  depth,
  selectedId,
  onSelect,
}: {
  category: ProductCategory;
  depth: number;
  selectedId: string | null;
  onSelect: (c: ProductCategory) => void;
}) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = category.children && category.children.length > 0;
  const isSelected = selectedId === category.id;

  return (
    <div>
      <button
        onClick={() => {
          onSelect(category);
          if (hasChildren) setExpanded(!expanded);
        }}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors text-left',
          isSelected
            ? 'bg-gable-green/10 text-gable-green border border-gable-green/20'
            : 'text-slate-300 hover:bg-white/5 hover:text-white border border-transparent'
        )}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown size={14} className="text-slate-500 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-slate-500 shrink-0" />
          )
        ) : (
          <span className="w-[14px] shrink-0" />
        )}
        <span className="truncate">{category.name}</span>
        {depth === 0 && (
          <span className="ml-auto text-[10px] text-slate-600 font-mono">{category.path}</span>
        )}
      </button>
      {hasChildren && expanded && (
        <div>
          {category.children!.map((child) => (
            <CategoryNode
              key={child.id}
              category={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const CategoryTree = ({ categories, selectedId, onSelect }: CategoryTreeProps) => {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
        <FolderTree size={14} />
        Product Categories
      </div>
      <div className="space-y-0.5">
        {categories.map((cat) => (
          <CategoryNode
            key={cat.id}
            category={cat}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
};
