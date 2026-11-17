// Java sample
import java.util.List;

public class Main {
    record Turbine(String name, double powerKw) {}

    public static void main(String[] args) {
        List<Turbine> farm = List.of(new Turbine("WTG-01", 2410.5), new Turbine("WTG-02", 0));
        farm.forEach(t -> System.out.printf("%s: %.1f kW%n", t.name(), t.powerKw()));
    }
}
