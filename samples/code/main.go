// Go sample
package main

import "fmt"

type Turbine struct {
	Name    string
	PowerKW float64
}

func main() {
	farm := []Turbine{{"WTG-01", 2410.5}, {"WTG-02", 0}}
	for _, t := range farm {
		fmt.Printf("%s: %.1f kW\n", t.Name, t.PowerKW)
	}
}
