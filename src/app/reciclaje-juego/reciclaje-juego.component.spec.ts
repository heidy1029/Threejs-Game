import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReciclajeJuegoComponent } from './reciclaje-juego.component';

describe('ReciclajeJuegoComponent', () => {
  let component: ReciclajeJuegoComponent;
  let fixture: ComponentFixture<ReciclajeJuegoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReciclajeJuegoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReciclajeJuegoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
