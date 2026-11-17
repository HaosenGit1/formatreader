// C# sample
using System;
using System.Linq;

var readings = new[] { 2410.5, 2385.0, 0.0 };
var online = readings.Count(r => r > 0);
Console.WriteLine($"{online} of {readings.Length} turbines online");
