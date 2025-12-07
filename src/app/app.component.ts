import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ReciclajeJuegoComponent } from './reciclaje-juego/reciclaje-juego.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ReciclajeJuegoComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Threejs-Game';
}
