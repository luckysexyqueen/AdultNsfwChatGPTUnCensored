import { MessageSquare, Sparkles, Code, Lightbulb } from 'lucide-react';

const suggestions = [
  { icon: Sparkles, text: '창의적인 이야기 만들기' },
  { icon: Code, text: '코드 작성 도움받기' },
  { icon: Lightbulb, text: '아이디어 브레인스토밍' },
  { icon: MessageSquare, text: '일상 대화 나누기' },
];

export function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-3xl font-semibold">무엇을 도와드릴까요?</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suggestions.map((suggestion, index) => {
            const Icon = suggestion.icon;
            return (
              <div
                key={index}
                className="p-4 rounded-lg border border-border bg-card hover:bg-accent transition-colors cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <Icon className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{suggestion.text}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
