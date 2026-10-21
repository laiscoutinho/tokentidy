import { Component } from '@angular/core';

@Component({
  selector: 'app-badge',
  template: `<span class="badge" style="color: #dc2626" [style.padding.px]="4" [ngStyle]="{ 'border-radius': '8px' }">{{ label }}</span>`,
})
export class BadgeComponent {
  label = 'new';
}
